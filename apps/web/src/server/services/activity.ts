import "server-only";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { applicationEvents, applications } from "@/server/db/schema";
import type { ApplicationEvent, Database } from "@/server/db/types";

export type ActivityItem = ApplicationEvent & {
  application: {
    id: string;
    companyName: string;
    companyDomain: string | null;
  };
};

/**
 * The latest updates Trackr recorded on its own (from Gmail, the browser
 * extension or the system), newest first. Undone updates are left out.
 */
export async function listRecentAutomation(
  userId: string,
  limit = 6,
  db: Database = getDb(),
): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      event: applicationEvents,
      application: {
        id: applications.id,
        companyName: applications.companyName,
        companyDomain: applications.companyDomain,
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
        ne(applicationEvents.sourceType, "MANUAL"),
        isNull(applicationEvents.revertedAt),
      ),
    )
    .orderBy(
      desc(applicationEvents.eventTimestamp),
      desc(applicationEvents.createdAt),
    )
    .limit(limit);

  return rows.map(({ event, application }) => ({ ...event, application }));
}
