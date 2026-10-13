import "server-only";
import type { InterviewType } from "@trackr/domain";
import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { applications, interviews } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { dueFollowUps } from "./reminders";
import { countOpenReviewItems } from "./review";
import { getFollowUpSettings } from "./settings";

type AgendaApplication = {
  applicationId: string;
  companyName: string;
  companyDomain: string | null;
  jobTitle: string;
};

export type Agenda = {
  /** Scheduled interviews still to come, soonest first. */
  interviews: (AgendaApplication & {
    at: Date;
    interviewType: InterviewType;
  })[];
  /** Applications due a follow-up, most recently due first. */
  followUps: (AgendaApplication & { dueAt: Date })[];
  /** Emails and possible duplicates waiting for a decision. */
  reviews: number;
};

const application = {
  applicationId: applications.id,
  companyName: applications.companyName,
  companyDomain: applications.companyDomain,
  jobTitle: applications.jobTitle,
};

/** What needs the person next: upcoming interviews, follow-ups due, reviews. */
export async function getAgenda(
  userId: string,
  { now = new Date(), limit = 4 }: { now?: Date; limit?: number } = {},
  db: Database = getDb(),
): Promise<Agenda> {
  const [upcoming, followUps, reviews] = await Promise.all([
    db
      .select({
        ...application,
        at: interviews.scheduledAt,
        interviewType: interviews.interviewType,
      })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .where(
        and(
          eq(interviews.userId, userId),
          eq(interviews.status, "SCHEDULED"),
          gte(interviews.scheduledAt, now),
        ),
      )
      .orderBy(asc(interviews.scheduledAt))
      .limit(limit),
    // From the applications, not the notifications: reading a reminder
    // doesn't mean the follow-up happened.
    getFollowUpSettings(userId, db).then(async ({ enabled, afterDays }) =>
      enabled ? dueFollowUps(userId, { now, afterDays }, db) : [],
    ),
    countOpenReviewItems(userId, db),
  ]);
  return {
    interviews: upcoming.map((row) => ({ ...row, at: row.at! })),
    followUps: followUps
      .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime())
      .slice(0, limit)
      .map(
        ({ applicationId, companyName, companyDomain, jobTitle, dueAt }) => ({
          applicationId,
          companyName,
          companyDomain,
          jobTitle,
          dueAt,
        }),
      ),
    reviews,
  };
}
