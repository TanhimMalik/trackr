import "server-only";
import {
  normalizeCompanyName,
  type ApplicationEventType,
  type ApplicationStatus,
  type EmailClassification,
  type ReviewItemKind,
} from "@trackr/domain";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  applicationEvents,
  applications,
  contacts,
  emails,
  interviews,
  notifications,
  reviewItems,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { NotFoundError } from "./errors";
import { newApplicationValues } from "./applications";
import {
  processApplicationEvent,
  recomputeApplicationState,
  type ApplicationEventInput,
} from "./events";
import { assertId } from "./ids";

export type ReviewApplication = {
  id: string;
  companyName: string;
  companyDomain: string | null;
  jobTitle: string;
  status: ApplicationStatus;
  appliedAt: Date | null;
  jobUrl: string | null;
};

export type DuplicateReview = {
  id: string;
  kind: "POSSIBLE_DUPLICATE";
  createdAt: Date;
  matchScore: number | null;
  matchReasons: string[];
  application: ReviewApplication;
  candidate: ReviewApplication | null;
};

export type ReviewEmail = {
  gmailMessageId: string;
  senderName: string | null;
  senderEmail: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: Date;
  classification: EmailClassification | null;
  confidence: number | null;
  evidence: string | null;
  companyName: string | null;
  jobTitle: string | null;
};

/** An email Trackr wasn't sure about, with the update it would make. */
export type EmailReview = {
  id: string;
  kind: Exclude<ReviewItemKind, "POSSIBLE_DUPLICATE">;
  createdAt: Date;
  email: ReviewEmail;
  eventType: ApplicationEventType | null;
  candidate: ReviewApplication | null;
};

export type OpenReviewItem = DuplicateReview | EmailReview;

const applicationSummary = (ids: string[], userId: string, db: Database) =>
  ids.length === 0
    ? Promise.resolve([])
    : db
        .select({
          id: applications.id,
          companyName: applications.companyName,
          companyDomain: applications.companyDomain,
          jobTitle: applications.jobTitle,
          status: applications.currentStatus,
          appliedAt: applications.appliedAt,
          jobUrl: applications.jobUrl,
        })
        .from(applications)
        .where(
          and(eq(applications.userId, userId), inArray(applications.id, ids)),
        );

/** Everything waiting for a decision, newest first. */
export async function listOpenReviewItems(
  userId: string,
  db: Database = getDb(),
): Promise<OpenReviewItem[]> {
  const items = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), eq(reviewItems.state, "OPEN")))
    .orderBy(desc(reviewItems.createdAt));

  const emailIds = items.flatMap((item) =>
    item.emailId ? [item.emailId] : [],
  );
  const emailRows = new Map(
    (emailIds.length === 0
      ? []
      : await db
          .select()
          .from(emails)
          .where(and(eq(emails.userId, userId), inArray(emails.id, emailIds)))
    ).map((row) => [row.id, row]),
  );

  const ids = items.flatMap((item) =>
    [item.applicationId, item.candidateApplicationId].filter(
      (id): id is string => id !== null,
    ),
  );
  const summaries = new Map(
    (await applicationSummary([...new Set(ids)], userId, db)).map((app) => [
      app.id,
      app,
    ]),
  );

  return items.flatMap((item): OpenReviewItem[] => {
    const candidate = item.candidateApplicationId
      ? (summaries.get(item.candidateApplicationId) ?? null)
      : null;
    if (item.kind !== "POSSIBLE_DUPLICATE") {
      const email = item.emailId ? emailRows.get(item.emailId) : undefined;
      if (!email) return [];
      const extracted = email.extractedJson ?? {};
      return [
        {
          id: item.id,
          kind: item.kind,
          createdAt: item.createdAt,
          eventType:
            typeof item.proposedEvent?.type === "string"
              ? (item.proposedEvent.type as ApplicationEventType)
              : null,
          candidate,
          email: {
            gmailMessageId: email.gmailMessageId,
            senderName: email.senderName,
            senderEmail: email.senderEmail,
            subject: email.subject,
            snippet: email.snippet,
            receivedAt: email.receivedAt,
            classification: email.classification,
            confidence: email.classificationConfidence,
            evidence:
              typeof extracted.evidence === "string"
                ? extracted.evidence
                : null,
            companyName: email.companyName,
            jobTitle: email.jobTitle,
          },
        },
      ];
    }
    const application = item.applicationId
      ? summaries.get(item.applicationId)
      : undefined;
    if (!application) return [];
    return [
      {
        id: item.id,
        kind: item.kind,
        createdAt: item.createdAt,
        matchScore: item.matchScore,
        matchReasons: item.matchReasons ?? [],
        application,
        candidate,
      },
    ];
  });
}

export async function countOpenReviewItems(
  userId: string,
  db: Database = getDb(),
): Promise<number> {
  const [row] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), eq(reviewItems.state, "OPEN")));
  return row?.open ?? 0;
}

/** Open review items about one application, for its detail view. */
export async function openReviewItemsFor(
  userId: string,
  applicationId: string,
  db: Database = getDb(),
): Promise<{ id: string; kind: ReviewItemKind }[]> {
  return db
    .select({ id: reviewItems.id, kind: reviewItems.kind })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(reviewItems.applicationId, applicationId),
        eq(reviewItems.state, "OPEN"),
      ),
    );
}

async function lockOpenDuplicate(tx: Database, userId: string, itemId: string) {
  assertId(itemId, "Review item");
  const [item] = await tx
    .select()
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.id, itemId),
        eq(reviewItems.userId, userId),
        eq(reviewItems.state, "OPEN"),
        eq(reviewItems.kind, "POSSIBLE_DUPLICATE"),
      ),
    )
    .for("update");
  if (!item) throw new NotFoundError("Review item");
  return item;
}

/** The notification that asked about a review item is answered with it. */
const markReviewNotificationRead = (
  tx: Database,
  userId: string,
  itemId: string,
) =>
  tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.dedupeKey, `review:${itemId}`),
        isNull(notifications.readAt),
      ),
    );

/**
 * They're the same application: everything recorded on the newer one moves
 * to the existing one, which also takes any details it was missing, and the
 * newer one is deleted. Returns the application that remains.
 */
export async function mergeDuplicate(
  userId: string,
  itemId: string,
  db: Database = getDb(),
): Promise<{ applicationId: string }> {
  return db.transaction(async (tx) => {
    const item = await lockOpenDuplicate(tx, userId, itemId);
    const duplicateId = item.applicationId;
    const keepId = item.candidateApplicationId;
    if (!duplicateId || !keepId) throw new NotFoundError("Review item");

    const rows = await tx
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          inArray(applications.id, [duplicateId, keepId]),
        ),
      )
      .for("update");
    const duplicate = rows.find((row) => row.id === duplicateId);
    const keep = rows.find((row) => row.id === keepId);
    if (!duplicate || !keep) throw new NotFoundError("Review item");

    // Contacts the kept application already has (by email) aren't copied twice.
    await tx.execute(sql`
      delete from ${contacts}
      where ${contacts.applicationId} = ${duplicateId}
        and ${contacts.email} in (
          select email from contacts
          where application_id = ${keepId} and email is not null
        )`);
    for (const table of [
      applicationEvents,
      contacts,
      interviews,
      notifications,
    ]) {
      await tx
        .update(table)
        .set({ applicationId: keepId })
        .where(eq(table.applicationId, duplicateId));
    }
    await tx
      .update(reviewItems)
      .set({
        applicationId: keepId,
        state: "RESOLVED",
        resolution: "MERGED",
        resolvedAt: new Date(),
      })
      .where(eq(reviewItems.id, item.id));
    await tx.delete(applications).where(eq(applications.id, duplicateId));

    // Only after the duplicate is gone, so its posting id is free to move.
    await tx
      .update(applications)
      .set({
        companyDomain: keep.companyDomain ?? duplicate.companyDomain,
        jobUrl: keep.jobUrl ?? duplicate.jobUrl,
        atsJobId: keep.atsJobId ?? duplicate.atsJobId,
        sourcePlatform:
          keep.atsJobId || keep.sourcePlatform !== "OTHER"
            ? keep.sourcePlatform
            : duplicate.sourcePlatform,
        location: keep.location ?? duplicate.location,
        jobDescription: keep.jobDescription ?? duplicate.jobDescription,
        notes: keep.notes ?? duplicate.notes,
      })
      .where(eq(applications.id, keepId));
    await recomputeApplicationState(tx, userId, keepId);
    await markReviewNotificationRead(tx, userId, item.id);
    return { applicationId: keepId };
  });
}

/** They're different applications: both stay as they are. */
export async function keepBoth(
  userId: string,
  itemId: string,
  db: Database = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await lockOpenDuplicate(tx, userId, itemId);
    await tx
      .update(reviewItems)
      .set({
        state: "DISMISSED",
        resolution: "DISMISSED",
        resolvedAt: new Date(),
      })
      .where(eq(reviewItems.id, item.id));
    await markReviewNotificationRead(tx, userId, item.id);
  });
}

const EMAIL_KINDS = [
  "EMAIL_POSSIBLE_MATCH",
  "EMAIL_UNMATCHED",
  "LOW_CONFIDENCE_UPDATE",
] as const;

async function lockOpenEmailItem(tx: Database, userId: string, itemId: string) {
  assertId(itemId, "Review item");
  const [item] = await tx
    .select()
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.id, itemId),
        eq(reviewItems.userId, userId),
        eq(reviewItems.state, "OPEN"),
        inArray(reviewItems.kind, [...EMAIL_KINDS]),
      ),
    )
    .for("update");
  if (!item?.emailId || !item.proposedEvent)
    throw new NotFoundError("Review item");
  const [email] = await tx
    .select()
    .from(emails)
    .where(eq(emails.id, item.emailId));
  if (!email) throw new NotFoundError("Review item");
  const stored = item.proposedEvent as Omit<
    ApplicationEventInput,
    "userId" | "applicationId" | "occurredAt"
  > & {
    occurredAt: string;
  };
  return {
    item,
    email,
    event: { ...stored, occurredAt: new Date(stored.occurredAt) },
  };
}

/** Records the email's update on an application and links the email to it. */
async function applyEmailUpdate(
  tx: Database,
  userId: string,
  applicationId: string,
  { item, email, event }: Awaited<ReturnType<typeof lockOpenEmailItem>>,
  resolution: "CONFIRMED" | "LINKED" | "CREATED",
) {
  await processApplicationEvent({ ...event, userId, applicationId }, tx);
  const recruiter = (
    email.extractedJson as {
      recruiter?: { name: string | null; email: string };
    } | null
  )?.recruiter;
  if (recruiter?.email) {
    await tx
      .insert(contacts)
      .values({
        userId,
        applicationId,
        name: recruiter.name ?? recruiter.email.split("@")[0]!,
        email: recruiter.email,
        contactType: "RECRUITER",
      })
      .onConflictDoNothing();
  }
  await tx
    .update(emails)
    .set({ processingStatus: "MATCHED", applicationId })
    .where(eq(emails.id, email.id));
  await tx
    .update(reviewItems)
    .set({
      state: "RESOLVED",
      resolution,
      applicationId,
      resolvedAt: new Date(),
    })
    .where(eq(reviewItems.id, item.id));
  await markReviewNotificationRead(tx, userId, item.id);
}

/** Yes, this email is about the suggested application: apply its update. */
export async function applyEmailReview(
  userId: string,
  itemId: string,
  db: Database = getDb(),
): Promise<{ applicationId: string }> {
  return db.transaction(async (tx) => {
    const locked = await lockOpenEmailItem(tx, userId, itemId);
    const applicationId = locked.item.candidateApplicationId;
    if (!applicationId) throw new NotFoundError("Review item");
    await applyEmailUpdate(
      tx,
      userId,
      applicationId,
      locked,
      locked.item.kind === "EMAIL_POSSIBLE_MATCH" ? "LINKED" : "CONFIRMED",
    );
    return { applicationId };
  });
}

export const newApplicationFromEmailSchema = z.object({
  companyName: z.string().trim().min(1, "Enter the company.").max(200),
  jobTitle: z.string().trim().min(1, "Enter the role.").max(200),
});

/** It's about a job Trackr doesn't know yet: start an application from it. */
export async function createApplicationFromEmail(
  userId: string,
  itemId: string,
  input: unknown,
  db: Database = getDb(),
): Promise<{ applicationId: string }> {
  const { companyName, jobTitle } = newApplicationFromEmailSchema.parse(input);
  return db.transaction(async (tx) => {
    const locked = await lockOpenEmailItem(tx, userId, itemId);
    const extracted = (locked.email.extractedJson ?? {}) as {
      platform?: string | null;
      atsJobId?: string | null;
    };
    const [created] = await tx
      .insert(applications)
      .values({
        ...newApplicationValues(userId, {
          companyName,
          jobTitle,
          status: "APPLIED",
          companyWebsite:
            locked.email.senderDomain &&
            normalizeCompanyName(companyName) ===
              normalizeCompanyName(locked.email.senderDomain.split(".")[0]!)
              ? locked.email.senderDomain
              : undefined,
        }),
        atsJobId: extracted.atsJobId ?? null,
      })
      .returning({ id: applications.id });
    await applyEmailUpdate(tx, userId, created!.id, locked, "CREATED");
    return { applicationId: created!.id };
  });
}

/** Not about an application, or not worth recording. */
export async function dismissEmailReview(
  userId: string,
  itemId: string,
  db: Database = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const { item, email } = await lockOpenEmailItem(tx, userId, itemId);
    await tx
      .update(emails)
      .set({ processingStatus: "DISMISSED" })
      .where(eq(emails.id, email.id));
    await tx
      .update(reviewItems)
      .set({
        state: "DISMISSED",
        resolution: "DISMISSED",
        resolvedAt: new Date(),
      })
      .where(eq(reviewItems.id, item.id));
    await markReviewNotificationRead(tx, userId, item.id);
  });
}
