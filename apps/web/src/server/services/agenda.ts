import "server-only";
import type { InterviewType } from "@trackr/domain";
import { and, asc, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { applications, interviews, notifications } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { countOpenReviewItems } from "./review";

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
  /** Applications whose follow-up reminder hasn't been read. */
  followUps: (AgendaApplication & { remindedAt: Date })[];
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
    db
      .select({ ...application, remindedAt: notifications.createdAt })
      .from(notifications)
      .innerJoin(applications, eq(applications.id, notifications.applicationId))
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, "FOLLOW_UP_DUE"),
          isNull(notifications.readAt),
          isNotNull(notifications.applicationId),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    countOpenReviewItems(userId, db),
  ]);
  return {
    interviews: upcoming.map((row) => ({ ...row, at: row.at! })),
    followUps,
    reviews,
  };
}
