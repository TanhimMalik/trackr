import "server-only";
import type { ApplicationStatus, ReviewItemKind } from "@trackr/domain";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  applicationEvents,
  applications,
  contacts,
  interviews,
  notifications,
  reviewItems,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { NotFoundError } from "./errors";
import { recomputeApplicationState } from "./events";
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

export type OpenReviewItem = {
  id: string;
  kind: ReviewItemKind;
  createdAt: Date;
  matchScore: number | null;
  matchReasons: string[];
  application: ReviewApplication;
  candidate: ReviewApplication | null;
};

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

  return items.flatMap((item) => {
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
        candidate: item.candidateApplicationId
          ? (summaries.get(item.candidateApplicationId) ?? null)
          : null,
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
