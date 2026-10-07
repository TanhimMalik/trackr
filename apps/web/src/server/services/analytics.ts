import "server-only";
import {
  computeOverviewMetrics,
  FUNNEL_PERIODS,
  funnelForPeriod,
  summarizeProgress,
  type ApplicationProgress,
  type Funnel,
  type FunnelPeriod,
  type OverviewMetrics,
  type ProgressEvent,
} from "@trackr/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { applicationEvents, applications } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

/** How far each of the user's applications got, from its active events. */
export async function loadApplicationProgress(
  userId: string,
  db: Database = getDb(),
): Promise<ApplicationProgress[]> {
  const [rows, events] = await Promise.all([
    db
      .select({
        id: applications.id,
        appliedAt: applications.appliedAt,
        currentStatus: applications.currentStatus,
      })
      .from(applications)
      .where(eq(applications.userId, userId)),
    db
      .select({
        applicationId: applicationEvents.applicationId,
        type: applicationEvents.eventType,
        occurredAt: applicationEvents.eventTimestamp,
        statusAfter: applicationEvents.statusAfter,
      })
      .from(applicationEvents)
      .where(
        and(
          eq(applicationEvents.userId, userId),
          isNull(applicationEvents.revertedAt),
        ),
      )
      .orderBy(
        asc(applicationEvents.eventTimestamp),
        asc(applicationEvents.createdAt),
      ),
  ]);

  const eventsById = new Map<string, ProgressEvent[]>();
  for (const { applicationId, ...event } of events) {
    const list = eventsById.get(applicationId);
    if (list) list.push(event);
    else eventsById.set(applicationId, [event]);
  }

  return rows.map((row) =>
    summarizeProgress({
      appliedAt: row.appliedAt,
      currentStatus: row.currentStatus,
      events: eventsById.get(row.id) ?? [],
    }),
  );
}

export type OverviewAnalytics = {
  metrics: OverviewMetrics;
  funnels: Record<FunnelPeriod, Funnel>;
};

/** Summary metrics and the funnel for every period, from one read. */
export async function getOverviewAnalytics(
  userId: string,
  db: Database = getDb(),
  now: Date = new Date(),
): Promise<OverviewAnalytics> {
  const progress = await loadApplicationProgress(userId, db);
  const periods = Object.keys(FUNNEL_PERIODS) as FunnelPeriod[];

  return {
    metrics: computeOverviewMetrics(progress, now),
    funnels: Object.fromEntries(
      periods.map((period) => [period, funnelForPeriod(progress, period, now)]),
    ) as Record<FunnelPeriod, Funnel>,
  };
}
