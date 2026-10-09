import "server-only";
import {
  CLASSIFICATION_EVENTS,
  classifyEmail,
  extractEmailDetails,
  normalizeJobTitle,
  PLACEHOLDER_JOB_TITLE,
  scoreRelevance,
  senderDomain,
  type ApplicationEventType,
  type EmailContent,
  type EmailMetadata,
  type ExtractedDetails,
  type MatchResult,
  type RuleClassification,
} from "@trackr/domain";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  applications,
  contacts,
  emails,
  notifications,
  reviewItems,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import type { GmailClient } from "@/server/integrations/gmail-api";
import {
  receivedAt,
  toEmailContent,
  toEmailMetadata,
} from "@/server/integrations/gmail-message";
import { newApplicationValues } from "./applications";
import { processApplicationEvent, type ApplicationEventInput } from "./events";
import { routeEmail } from "./email-routing";

export type MessageOutcome =
  "skipped" | "ignored" | "applied" | "created" | "review";

type MessageRef = { id: string; threadId: string };

/** A message to process, before Trackr has looked at it. */
export type IncomingEmail = {
  ref: MessageRef;
  receivedAt: Date;
  /** Headers and snippet; who sent it is checked against known contacts. */
  metadata: Omit<EmailMetadata, "knownThread" | "knownContact">;
  /** Reads the body. Called only when the message looks job-related. */
  loadContent: (metadata: EmailMetadata) => Promise<EmailContent>;
};

export type EmailOutcome = {
  outcome: MessageOutcome;
  applicationId: string | null;
};

/** The event a classified email proposes, minus the application it goes to. */
type ProposedEvent = Omit<ApplicationEventInput, "userId" | "applicationId">;

function proposedEvent(
  type: ApplicationEventType,
  messageId: string,
  received: Date,
  rule: RuleClassification,
  details: ExtractedDetails,
): ProposedEvent {
  const interview = type.startsWith("INTERVIEW_");
  return {
    type,
    occurredAt: received,
    sourceType: "EMAIL",
    sourceReference: messageId,
    classificationMethod: "RULES",
    confidence: rule.confidence,
    metadata: interview
      ? {
          ...(details.interviewKind
            ? { interviewKind: details.interviewKind }
            : {}),
          ...(details.interviewAt ? { scheduledAt: details.interviewAt } : {}),
          ...(details.isFinalRound ? { isFinalRound: true } : {}),
        }
      : type === "NEXT_ROUND" && details.isFinalRound
        ? { isFinalRound: true }
        : {},
    dedupeKey: `email:${messageId}`,
  };
}

const serializeEvent = (event: ProposedEvent) => ({
  ...event,
  occurredAt: event.occurredAt.toISOString(),
});

/** A personal sender becomes a recruiter contact on the application, once. */
async function addRecruiter(
  tx: Database,
  userId: string,
  applicationId: string,
  details: ExtractedDetails,
) {
  if (!details.recruiter) return;
  await tx
    .insert(contacts)
    .values({
      userId,
      applicationId,
      name: details.recruiter.name ?? details.recruiter.email.split("@")[0]!,
      email: details.recruiter.email,
      contactType: "RECRUITER",
    })
    .onConflictDoNothing();
}

function logProcessed(fields: Record<string, unknown>) {
  // Allowlisted fields only: never subjects, snippets, bodies or addresses.
  console.info(JSON.stringify({ event: "gmail_message_processed", ...fields }));
}

/** Shown until an email names the role; a later email can fill it in. */
export const PLACEHOLDER_TITLE = PLACEHOLDER_JOB_TITLE;

export async function createApplicationFromDetails(
  tx: Database,
  userId: string,
  details: Pick<
    ExtractedDetails,
    "companyName" | "companyDomain" | "jobTitle" | "platform" | "atsJobId"
  >,
): Promise<{ id: string }> {
  const [created] = await tx
    .insert(applications)
    .values({
      ...newApplicationValues(userId, {
        companyName: details.companyName!,
        jobTitle: details.jobTitle ?? PLACEHOLDER_TITLE,
        companyWebsite: details.companyDomain ?? undefined,
        sourcePlatform: details.platform ?? undefined,
        // Status comes from the email's event, not from this.
        status: "APPLIED",
      }),
      atsJobId: details.atsJobId,
    })
    .returning({ id: applications.id });
  return created!;
}

/** Fills in the role on an application created before any email named it. */
export async function fillPlaceholderTitle(
  tx: Database,
  applicationId: string,
  jobTitle: string | null,
): Promise<void> {
  if (!jobTitle) return;
  await tx
    .update(applications)
    .set({ jobTitle, jobTitleNorm: normalizeJobTitle(jobTitle) })
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.jobTitle, PLACEHOLDER_TITLE),
      ),
    );
}

/**
 * Reads one Gmail message and acts on it: irrelevant messages are recorded
 * by id only; relevant ones are classified, matched and either applied to an
 * application, used to create one, or sent to review. Each message is handled
 * once; repeating it does nothing.
 */
export async function processGmailMessage(
  db: Database,
  client: GmailClient,
  context: { userId: string; integrationId: string },
  ref: MessageRef,
): Promise<MessageOutcome> {
  const [existing] = await db
    .select({ id: emails.id, status: emails.processingStatus })
    .from(emails)
    .where(
      and(eq(emails.userId, context.userId), eq(emails.gmailMessageId, ref.id)),
    );
  if (existing && existing.status !== "FAILED") return "skipped";

  const message = await client.metadata(ref.id);
  const { outcome } = await processIncomingEmail(
    db,
    context,
    {
      ref,
      receivedAt: receivedAt(message),
      metadata: toEmailMetadata(message),
      loadContent: async (metadata) =>
        toEmailContent(await client.full(ref.id), metadata),
    },
    existing?.id,
  );
  return outcome;
}

/**
 * The pipeline after a message is fetched, shared by Gmail sync and the
 * demo's simulated inbox. `replacesId` is a failed earlier attempt to redo.
 */
export async function processIncomingEmail(
  db: Database,
  { userId, integrationId }: { userId: string; integrationId: string | null },
  { ref, receivedAt: received, metadata: headers, loadContent }: IncomingEmail,
  replacesId?: string,
): Promise<EmailOutcome> {
  const started = Date.now();
  const existing = replacesId ? { id: replacesId } : undefined;
  const fromEmail = headers.fromEmail;
  const [thread] = await db
    .select({ id: emails.id })
    .from(emails)
    .where(
      and(
        eq(emails.userId, userId),
        eq(emails.gmailThreadId, ref.threadId),
        isNotNull(emails.applicationId),
      ),
    )
    .limit(1);
  const [contact] = fromEmail
    ? await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.userId, userId), eq(contacts.email, fromEmail)))
        .limit(1)
    : [];
  const metadata: EmailMetadata = {
    ...headers,
    knownThread: Boolean(thread),
    knownContact: Boolean(contact),
  };
  const ids = {
    userId,
    integrationId,
    gmailMessageId: ref.id,
    gmailThreadId: ref.threadId,
    receivedAt: received,
  };

  const relevance = scoreRelevance(metadata);
  if (!relevance.relevant) {
    await db.transaction(async (tx) => {
      if (existing) await tx.delete(emails).where(eq(emails.id, existing.id));
      // Identifiers only: nothing about an unrelated message is kept.
      await tx
        .insert(emails)
        .values({ ...ids, processingStatus: "IGNORED" })
        .onConflictDoNothing();
    });
    logProcessed({
      messageId: ref.id,
      relevant: false,
      durationMs: Date.now() - started,
    });
    return { outcome: "ignored", applicationId: null };
  }

  // The body is read for relevant messages only, and only held in memory.
  const content: EmailContent = await loadContent(metadata);
  const rule = classifyEmail(content);
  const details = extractEmailDetails(content);
  const eventType = CLASSIFICATION_EVENTS[rule.classification];

  const outcome = await db.transaction(
    async (
      tx,
    ): Promise<{
      outcome: MessageOutcome;
      applicationId: string | null;
      match: MatchResult | null;
    }> => {
      if (existing) await tx.delete(emails).where(eq(emails.id, existing.id));
      const route = await routeEmail(tx, userId, {
        classification: rule.classification,
        confidence: rule.confidence,
        method: "RULES",
        companyName: details.companyName,
        companyDomain: details.companyDomain,
        jobTitle: details.jobTitle,
        platform: details.platform,
        atsJobId: details.atsJobId,
        fromEmail,
        threadId: ref.threadId,
        receivedAt: received,
      });
      const match = route.match;

      const insertEmail = (
        status: "MATCHED" | "NEEDS_REVIEW" | "UNMATCHED",
        applicationId: string | null,
      ) =>
        tx
          .insert(emails)
          .values({
            ...ids,
            senderEmail: fromEmail || null,
            senderName: metadata.fromName,
            senderDomain: fromEmail ? senderDomain(fromEmail) : null,
            subject: metadata.subject.slice(0, 500),
            snippet: metadata.snippet.slice(0, 500),
            classification: rule.classification,
            classificationConfidence: rule.confidence,
            classificationMethod: "RULES" as const,
            extractedJson: {
              evidence: rule.evidence,
              companyDomain: details.companyDomain,
              platform: details.platform,
              atsJobId: details.atsJobId,
              recruiter: details.recruiter,
              interviewAt: details.interviewAt,
              interviewKind: details.interviewKind,
              isFinalRound: details.isFinalRound,
            },
            companyName: details.companyName,
            jobTitle: details.jobTitle,
            matchScore: match?.best?.score ?? null,
            processingStatus: status,
            applicationId,
          })
          .returning({ id: emails.id });

      if (route.action === "ignore" || !eventType) {
        // Job-related but unclear: kept (sender, subject, snippet) so it can
        // be looked at again when the rules improve. No review item.
        await insertEmail("UNMATCHED", null);
        return { outcome: "ignored", applicationId: null, match };
      }
      const event = proposedEvent(eventType, ref.id, received, rule, details);

      if (route.action === "create") {
        const created = await createApplicationFromDetails(tx, userId, details);
        await processApplicationEvent(
          { ...event, userId, applicationId: created.id },
          tx,
        );
        await addRecruiter(tx, userId, created.id, details);
        await insertEmail("MATCHED", created.id);
        return { outcome: "created", applicationId: created.id, match };
      }

      if (route.action === "apply") {
        const { applicationId } = route;
        await processApplicationEvent({ ...event, userId, applicationId }, tx);
        await addRecruiter(tx, userId, applicationId, details);
        await fillPlaceholderTitle(tx, applicationId, details.jobTitle);
        await insertEmail("MATCHED", applicationId);
        return { outcome: "applied", applicationId, match };
      }

      // Not sure enough: ask, with the update ready to apply.
      const [stored] = await insertEmail("NEEDS_REVIEW", null);
      const [review] = await tx
        .insert(reviewItems)
        .values({
          userId,
          kind: route.kind,
          emailId: stored!.id,
          applicationId: route.candidateId,
          candidateApplicationId: route.candidateId,
          proposedEvent: serializeEvent(event),
          matchScore: match?.best?.score ?? null,
          dedupeKey: `email:${ref.id}`,
        })
        .onConflictDoNothing({
          target: [reviewItems.userId, reviewItems.dedupeKey],
        })
        .returning({ id: reviewItems.id });
      if (review) {
        const who =
          details.companyName ??
          metadata.fromName ??
          (fromEmail ? senderDomain(fromEmail) : "a sender");
        await tx
          .insert(notifications)
          .values({
            userId,
            applicationId: route.candidateId,
            type: "REVIEW_NEEDED",
            title: `Check an email from ${who}`,
            body: metadata.subject.slice(0, 200) || null,
            dedupeKey: `review:${review.id}`,
          })
          .onConflictDoNothing({
            target: [notifications.userId, notifications.dedupeKey],
          });
      }
      return { outcome: "review", applicationId: route.candidateId, match };
    },
  );

  logProcessed({
    messageId: ref.id,
    relevant: true,
    classification: rule.classification,
    confidence: rule.confidence,
    method: "RULES",
    matchDecision: outcome.match?.decision ?? null,
    outcome: outcome.outcome,
    applicationId: outcome.applicationId,
    durationMs: Date.now() - started,
  });
  return { outcome: outcome.outcome, applicationId: outcome.applicationId };
}
