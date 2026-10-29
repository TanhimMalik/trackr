import "server-only";
import {
  employerDomainFromJobUrl,
  matchApplication,
  MIN_DESCRIPTION_LENGTH,
  normalizeCompanyName,
  normalizeJobTitle,
  plainTextDescription,
  triageRequestSchema,
  type TriagePosting,
  type TriageResponse,
  type TriageResult,
} from "@trackr/domain";
import { getDb } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import {
  LlmUnavailableError,
  type FitScorer,
} from "@/server/integrations/anthropic";
import {
  defaultFitScorer,
  FitLimitError,
  FitUnavailableError,
  getResumeProfile,
  scorePosting,
} from "./fit";
import { findMatchCandidates } from "./matching";

/** The application a posting already is, if Trackr clearly tracks it. */
export async function trackedApplication(
  db: Database,
  userId: string,
  posting: TriagePosting,
  now: Date,
): Promise<string | null> {
  const companyNameNorm = normalizeCompanyName(posting.companyName);
  const companyDomain = employerDomainFromJobUrl(posting.url);
  const candidates = await findMatchCandidates(db, userId, {
    companyNameNorm,
    companyDomain,
    platform: posting.platform,
    atsJobId: posting.atsJobId,
  });
  const match = matchApplication(
    {
      companyNameNorm,
      companyDomain,
      jobTitleNorm: normalizeJobTitle(posting.jobTitle),
      platform: posting.platform,
      atsJobId: posting.atsJobId,
      occurredAt: now,
    },
    candidates,
  );
  return match.decision === "AUTOMATIC" ? match.best.candidateId : null;
}

/**
 * Scores the job postings open in the person's tabs against their resume,
 * a few at a time, and says which they already track. Postings scored
 * since the profile last changed come from the cache at no cost. Once the
 * day's allowance runs out, or the model stops answering, the rest come
 * back unscored with the reason.
 */
export async function triagePostings(
  userId: string,
  payload: unknown,
  {
    scorer = defaultFitScorer(),
    now = new Date(),
    concurrency = 6,
  }: { scorer?: FitScorer | null; now?: Date; concurrency?: number } = {},
  db: Database = getDb(),
): Promise<TriageResponse> {
  const { postings } = triageRequestSchema.parse(payload);
  if (!scorer) throw new FitUnavailableError();
  const record = await getResumeProfile(userId, db);
  if (!record) return { hasProfile: false, results: [] };

  const results: TriageResult[] = new Array(postings.length);
  let stopped: "LIMIT" | "UNAVAILABLE" | null = null;
  const queue = postings.map((posting, index) => ({ posting, index }));

  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { posting, index } = next;
      const base = {
        url: posting.url,
        fit: null,
        trackedApplicationId: await trackedApplication(
          db,
          userId,
          posting,
          now,
        ),
      };
      const description = posting.description
        ? plainTextDescription(posting.description)
        : "";
      if (description.length < MIN_DESCRIPTION_LENGTH) {
        results[index] = { ...base, status: "NO_DESCRIPTION" };
        continue;
      }
      if (stopped) {
        results[index] = { ...base, status: stopped };
        continue;
      }
      try {
        const fit = await scorePosting(
          userId,
          {
            companyName: posting.companyName,
            jobTitle: posting.jobTitle,
            location: posting.location,
            description,
          },
          { scorer, now, record },
          db,
        );
        results[index] = { ...base, status: "SCORED", fit };
      } catch (error) {
        if (error instanceof FitLimitError) stopped = "LIMIT";
        else if (error instanceof LlmUnavailableError) {
          console.error("triage_score_failed", { code: error.code });
          stopped = "UNAVAILABLE";
        } else throw error;
        results[index] = { ...base, status: stopped };
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { hasProfile: true, results };
}
