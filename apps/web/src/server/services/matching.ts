import "server-only";
import type { MatchCandidate, SourcePlatform } from "@trackr/domain";
import { and, eq, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import { applications, emails } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export type CandidateQuery = {
  companyNameNorm: string | null;
  companyDomain?: string | null;
  platform?: SourcePlatform | null;
  atsJobId?: string | null;
  /** A Gmail thread: applications already linked to it are candidates. */
  threadId?: string | null;
};

/**
 * The applications a signal could belong to: same company, website, posting
 * or email thread. Each comes with the Gmail threads already linked to it.
 */
export async function findMatchCandidates(
  db: Database,
  userId: string,
  query: CandidateQuery,
): Promise<MatchCandidate[]> {
  const threadApplications = query.threadId
    ? (
        await db
          .select({ applicationId: emails.applicationId })
          .from(emails)
          .where(
            and(
              eq(emails.userId, userId),
              eq(emails.gmailThreadId, query.threadId),
              isNotNull(emails.applicationId),
            ),
          )
      ).map((row) => row.applicationId!)
    : [];

  const conditions = [
    query.companyNameNorm
      ? or(
          eq(applications.companyNameNorm, query.companyNameNorm),
          // "Calibrate" and "Calibrate Health", either way round.
          like(
            applications.companyNameNorm,
            `${escapeLike(query.companyNameNorm)} %`,
          ),
          sql`${query.companyNameNorm} like ${applications.companyNameNorm} || ' %'`,
        )
      : undefined,
    query.companyDomain
      ? eq(applications.companyDomain, query.companyDomain)
      : undefined,
    query.atsJobId && query.platform
      ? and(
          eq(applications.sourcePlatform, query.platform),
          eq(applications.atsJobId, query.atsJobId),
        )
      : undefined,
    threadApplications.length > 0
      ? inArray(applications.id, threadApplications)
      : undefined,
  ].filter((condition) => condition !== undefined);
  if (conditions.length === 0) return [];

  const rows = await db
    .select({
      id: applications.id,
      companyNameNorm: applications.companyNameNorm,
      companyDomain: applications.companyDomain,
      jobTitleNorm: applications.jobTitleNorm,
      sourcePlatform: applications.sourcePlatform,
      atsJobId: applications.atsJobId,
      appliedAt: applications.appliedAt,
      lastActivityAt: applications.lastActivityAt,
    })
    .from(applications)
    .where(and(eq(applications.userId, userId), or(...conditions)));
  if (rows.length === 0) return [];

  const threads = await db
    .selectDistinct({
      applicationId: emails.applicationId,
      threadId: emails.gmailThreadId,
    })
    .from(emails)
    .where(
      and(
        eq(emails.userId, userId),
        inArray(
          emails.applicationId,
          rows.map((row) => row.id),
        ),
      ),
    );

  return rows.map(({ appliedAt, lastActivityAt, ...row }) => ({
    ...row,
    activeAt: appliedAt ?? lastActivityAt,
    threadIds: threads
      .filter((thread) => thread.applicationId === row.id)
      .map((thread) => thread.threadId),
  }));
}
