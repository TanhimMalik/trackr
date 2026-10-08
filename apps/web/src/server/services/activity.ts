import "server-only";
import { and, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { ActivityCursor, ActivitySource } from "@/lib/activity/activity";
import { getDb } from "@/server/db/client";
import { applicationEvents, applications } from "@/server/db/schema";
import type { ApplicationEvent, Database } from "@/server/db/types";

export type ActivityItem = ApplicationEvent & {
  application: {
    id: string;
    companyName: string;
    companyDomain: string | null;
    /** How many of its events still count; the last one can't be undone. */
    activeEvents: number;
  };
};

/** How many events the Activity page shows at a time. */
export const ACTIVITY_PAGE_SIZE = 50;

function sourceCondition(source: ActivitySource): SQL | undefined {
  if (source === "automatic") return ne(applicationEvents.sourceType, "MANUAL");
  if (source === "manual") return eq(applicationEvents.sourceType, "MANUAL");
  return undefined;
}

/**
 * Events across all of a user's applications, newest first. Pass the last
 * item as `before` to continue. Undone events are included, so they can be
 * restored, unless `includeReverted` is false.
 */
export async function listActivity(
  userId: string,
  {
    source = "all",
    before = null,
    includeReverted = true,
    limit = ACTIVITY_PAGE_SIZE,
  }: {
    source?: ActivitySource;
    before?: ActivityCursor | null;
    includeReverted?: boolean;
    limit?: number;
  } = {},
  db: Database = getDb(),
): Promise<{ items: ActivityItem[]; next: ActivityCursor | null }> {
  // ISO strings: the postgres-js driver doesn't serialize raw dates in
  // hand-written SQL.
  const continuation = before
    ? sql`(${applicationEvents.eventTimestamp}, ${applicationEvents.createdAt}, ${applicationEvents.id}) < (${before.eventTimestamp.toISOString()}::timestamptz, ${before.createdAt.toISOString()}::timestamptz, ${before.id}::uuid)`
    : undefined;

  const rows = await db
    .select({
      event: applicationEvents,
      application: {
        id: applications.id,
        companyName: applications.companyName,
        companyDomain: applications.companyDomain,
        activeEvents: sql<number>`(
          select count(*)::int from application_events as other
          where other.application_id = ${applications.id}
            and other.reverted_at is null
        )`,
      },
    })
    .from(applicationEvents)
    .innerJoin(
      applications,
      and(
        eq(applications.id, applicationEvents.applicationId),
        eq(applications.userId, applicationEvents.userId),
      ),
    )
    .where(
      and(
        eq(applicationEvents.userId, userId),
        sourceCondition(source),
        includeReverted ? undefined : isNull(applicationEvents.revertedAt),
        continuation,
      ),
    )
    .orderBy(
      desc(applicationEvents.eventTimestamp),
      desc(applicationEvents.createdAt),
      desc(applicationEvents.id),
    )
    // One extra row says whether there is more.
    .limit(limit + 1);

  const items = rows
    .slice(0, limit)
    .map(({ event, application }) => ({ ...event, application }));
  const last = items.at(-1);
  return {
    items,
    next:
      rows.length > limit && last
        ? {
            eventTimestamp: last.eventTimestamp,
            createdAt: last.createdAt,
            id: last.id,
          }
        : null,
  };
}

/**
 * The latest updates Trackr recorded on its own (from Gmail, the browser
 * extension or the system), newest first. Undone updates are left out.
 */
export async function listRecentAutomation(
  userId: string,
  limit = 6,
  db: Database = getDb(),
): Promise<ActivityItem[]> {
  const { items } = await listActivity(
    userId,
    { source: "automatic", includeReverted: false, limit },
    db,
  );
  return items;
}
