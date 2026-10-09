import "server-only";
import {
  employerDomainFromJobUrl,
  extensionSubmissionSchema,
  MATCH_SIGNAL_LABELS,
  matchApplication,
  normalizeCompanyName,
  normalizeJobTitle,
  plainTextDescription,
  type ExtensionSubmission,
  type ExtensionSubmissionResponse,
  type ScoredCandidate,
} from "@trackr/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  applicationEvents,
  applications,
  notifications,
  reviewItems,
} from "@/server/db/schema";
import type { Application, Database } from "@/server/db/types";
import { newApplicationValues } from "./applications";
import { processApplicationEvent } from "./events";
import { findMatchCandidates } from "./matching";

const submissionKey = (clientSubmissionId: string) =>
  `ext:${clientSubmissionId}`;
export const duplicateReviewKey = (clientSubmissionId: string) =>
  `dup:${clientSubmissionId}`;

/** A repeated submission gets the answer the first one did. */
async function previousResponse(
  tx: Database,
  userId: string,
  submission: ExtensionSubmission,
): Promise<ExtensionSubmissionResponse | null> {
  const [event] = await tx
    .select({
      id: applicationEvents.id,
      applicationId: applicationEvents.applicationId,
    })
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.userId, userId),
        eq(
          applicationEvents.dedupeKey,
          submissionKey(submission.clientSubmissionId),
        ),
      ),
    );
  if (!event) return null;

  const [review] = await tx
    .select({ id: reviewItems.id })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(
          reviewItems.dedupeKey,
          duplicateReviewKey(submission.clientSubmissionId),
        ),
      ),
    );
  if (review) {
    return {
      applicationId: event.applicationId,
      outcome: "POSSIBLE_DUPLICATE",
    };
  }
  // The submission created the application if it is its first event.
  const [first] = await tx
    .select({ id: applicationEvents.id })
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, event.applicationId))
    .orderBy(asc(applicationEvents.createdAt))
    .limit(1);
  return {
    applicationId: event.applicationId,
    outcome: first?.id === event.id ? "CREATED" : "MATCHED_EXISTING",
  };
}

/** Fills in what an existing application is missing, never overwriting. */
async function enrichApplication(
  tx: Database,
  application: Application,
  submission: ExtensionSubmission,
  description: string | null,
) {
  const patch: Partial<typeof applications.$inferInsert> = {};
  if (!application.jobUrl) patch.jobUrl = submission.jobUrl;
  if (!application.location && submission.location) {
    patch.location = submission.location;
  }
  if (!application.jobDescription && description) {
    patch.jobDescription = description;
  }
  if (!application.atsJobId && submission.atsJobId) {
    patch.atsJobId = submission.atsJobId;
    patch.sourcePlatform = submission.platform;
  } else if (application.sourcePlatform === "OTHER") {
    patch.sourcePlatform = submission.platform;
  }
  if (Object.keys(patch).length > 0) {
    await tx
      .update(applications)
      .set(patch)
      .where(eq(applications.id, application.id));
  }
}

function recordSubmission(
  tx: Database,
  userId: string,
  applicationId: string,
  submission: ExtensionSubmission,
) {
  return processApplicationEvent(
    {
      userId,
      applicationId,
      type: "APPLICATION_SUBMITTED",
      occurredAt: new Date(submission.submittedAt),
      sourceType: "BROWSER_EXTENSION",
      sourceReference: submission.captureMode,
      dedupeKey: submissionKey(submission.clientSubmissionId),
    },
    tx,
  );
}

const matchReasons = (best: ScoredCandidate) =>
  best.signals.map((signal) => MATCH_SIGNAL_LABELS[signal]);

/**
 * Records an application the extension saw being submitted. It is added to
 * the application it clearly belongs to, or created; when it may duplicate
 * another application, it is created and the pair goes to review. Repeating
 * a submission returns the first answer and changes nothing.
 */
export async function ingestExtensionSubmission(
  userId: string,
  payload: unknown,
  db: Database = getDb(),
): Promise<ExtensionSubmissionResponse> {
  const submission = extensionSubmissionSchema.parse(payload);
  const companyNameNorm = normalizeCompanyName(submission.companyName);
  const companyDomain = employerDomainFromJobUrl(submission.jobUrl);
  const description = submission.description
    ? plainTextDescription(submission.description) || null
    : null;

  return db.transaction(async (tx) => {
    // Simultaneous retries of one submission wait for each other.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${submission.clientSubmissionId}`}))`,
    );
    const previous = await previousResponse(tx, userId, submission);
    if (previous) return previous;

    const candidates = await findMatchCandidates(tx, userId, {
      companyNameNorm,
      companyDomain,
      platform: submission.platform,
      atsJobId: submission.atsJobId,
    });
    const match = matchApplication(
      {
        companyNameNorm,
        companyDomain,
        jobTitleNorm: normalizeJobTitle(submission.jobTitle),
        platform: submission.platform,
        atsJobId: submission.atsJobId,
        occurredAt: new Date(submission.submittedAt),
      },
      candidates,
    );

    if (match.decision === "AUTOMATIC") {
      const [existing] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, match.best.candidateId));
      await enrichApplication(tx, existing!, submission, description);
      await recordSubmission(tx, userId, existing!.id, submission);
      return { applicationId: existing!.id, outcome: "MATCHED_EXISTING" };
    }

    const [created] = await tx
      .insert(applications)
      .values({
        ...newApplicationValues(userId, {
          companyName: submission.companyName,
          jobTitle: submission.jobTitle,
          jobUrl: submission.jobUrl,
          location: submission.location ?? undefined,
          jobDescription: description ?? undefined,
          sourcePlatform: submission.platform,
          // Status comes from the submission event, not from this.
          status: "APPLIED",
        }),
        atsJobId: submission.atsJobId,
      })
      .returning({ id: applications.id });
    await recordSubmission(tx, userId, created!.id, submission);

    if (match.decision === "NONE") {
      return { applicationId: created!.id, outcome: "CREATED" };
    }

    const [review] = await tx
      .insert(reviewItems)
      .values({
        userId,
        kind: "POSSIBLE_DUPLICATE",
        applicationId: created!.id,
        candidateApplicationId: match.best.candidateId,
        matchScore: match.best.score,
        matchReasons: matchReasons(match.best),
        dedupeKey: duplicateReviewKey(submission.clientSubmissionId),
      })
      .returning({ id: reviewItems.id });
    await tx.insert(notifications).values({
      userId,
      applicationId: created!.id,
      type: "REVIEW_NEEDED",
      title: `Is this ${submission.companyName} application a duplicate?`,
      body: submission.jobTitle,
      dedupeKey: `review:${review!.id}`,
    });
    return { applicationId: created!.id, outcome: "POSSIBLE_DUPLICATE" };
  });
}
