import "server-only";
import {
  computeFit,
  DEFAULT_FIT_PREFERENCES,
  FIT_PROMPT_VERSION,
  fitPostingText,
  fitPreferencesSchema,
  tidyResumeProfile,
  type FitPreferences,
  type ResumeProfile,
} from "@trackr/domain";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { applications, resumeProfiles } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { fitLlmConfig } from "@/server/env";
import type { StoredFit } from "@/server/fit/types";
import {
  fitScorer,
  LlmUnavailableError,
  resumeReader,
  type FitScorer,
  type ResumeReader,
} from "@/server/integrations/anthropic";
import { NotFoundError } from "./errors";
import { consumeRateLimit } from "./rate-limit";

/** The largest resume accepted, well above any real one. */
export const RESUME_MAX_BYTES = 4 * 1024 * 1024;
/** Resumes read per user per day. */
export const RESUME_DAILY_LIMIT = 10;
/** Postings scored per user per day. */
export const FIT_DAILY_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** No model is configured on this deployment. */
export class FitUnavailableError extends Error {
  constructor() {
    super("Fit scoring isn't set up on this deployment");
    this.name = "FitUnavailableError";
  }
}

/** The daily allowance is used up. */
export class FitLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("The daily limit for this was reached");
    this.name = "FitLimitError";
  }
}

/** The file isn't a PDF, is too large, or the model couldn't read it. */
export class ResumeUnreadableError extends Error {
  constructor(readonly reason: "not_pdf" | "too_large" | "unreadable") {
    super(`The resume couldn't be read (${reason})`);
    this.name = "ResumeUnreadableError";
  }
}

export type ResumeProfileRecord = {
  profile: ResumeProfile;
  preferences: FitPreferences;
  sourceFilename: string | null;
  updatedAt: Date;
};

export async function getResumeProfile(
  userId: string,
  db: Database = getDb(),
): Promise<ResumeProfileRecord | null> {
  const [row] = await db
    .select({
      profile: resumeProfiles.profile,
      preferences: resumeProfiles.preferences,
      sourceFilename: resumeProfiles.sourceFilename,
      updatedAt: resumeProfiles.updatedAt,
    })
    .from(resumeProfiles)
    .where(eq(resumeProfiles.userId, userId));
  return row ?? null;
}

const defaultReader = (): ResumeReader | null => {
  const config = fitLlmConfig();
  return config ? resumeReader(config) : null;
};

export const defaultFitScorer = (): FitScorer | null => {
  const config = fitLlmConfig();
  return config ? fitScorer(config) : null;
};

async function spend(
  key: string,
  limit: number,
  now: Date,
  db: Database,
): Promise<void> {
  const rate = await consumeRateLimit(
    key,
    { limit, windowMs: DAY_MS, now },
    db,
  );
  if (!rate.allowed) throw new FitLimitError(rate.retryAfterSeconds);
}

/**
 * Reads a resume PDF into a profile and keeps the profile, not the file.
 * Existing scores go stale and are worked out again against the new one.
 */
export async function saveResumeProfile(
  userId: string,
  { pdf, filename }: { pdf: Buffer; filename: string | null },
  {
    reader = defaultReader(),
    now = new Date(),
  }: { reader?: ResumeReader | null; now?: Date } = {},
  db: Database = getDb(),
): Promise<ResumeProfileRecord> {
  if (!reader) throw new FitUnavailableError();
  if (pdf.length > RESUME_MAX_BYTES) {
    throw new ResumeUnreadableError("too_large");
  }
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ResumeUnreadableError("not_pdf");
  }
  await spend(`resume:${userId}`, RESUME_DAILY_LIMIT, now, db);

  let read;
  try {
    read = await reader(pdf);
  } catch (error) {
    if (error instanceof LlmUnavailableError) {
      console.error("resume_read_failed", { code: error.code });
      throw new ResumeUnreadableError("unreadable");
    }
    throw error;
  }
  const profile = tidyResumeProfile(read.output);
  const sourceFilename = filename?.slice(0, 200) || null;
  const [row] = await db
    .insert(resumeProfiles)
    .values({
      userId,
      profile,
      preferences: DEFAULT_FIT_PREFERENCES,
      sourceFilename,
      model: read.model,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: resumeProfiles.userId,
      set: { profile, sourceFilename, model: read.model, updatedAt: now },
    })
    .returning();
  return {
    profile: row!.profile,
    preferences: row!.preferences,
    sourceFilename: row!.sourceFilename,
    updatedAt: row!.updatedAt,
  };
}

/** Saves the person's own preferences; scores go stale, since pay and place count. */
export async function updateFitPreferences(
  userId: string,
  input: unknown,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<FitPreferences> {
  const preferences = fitPreferencesSchema.parse(input);
  const updated = await db
    .update(resumeProfiles)
    .set({ preferences, updatedAt: now })
    .where(eq(resumeProfiles.userId, userId))
    .returning({ userId: resumeProfiles.userId });
  if (updated.length === 0) throw new NotFoundError("Resume profile");
  return preferences;
}

/** Forgets the profile and every score made from it. */
export async function deleteResumeProfile(
  userId: string,
  db: Database = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(resumeProfiles).where(eq(resumeProfiles.userId, userId));
    await tx
      .update(applications)
      .set({ fitScore: null, fit: null, fitScoredAt: null })
      .where(and(eq(applications.userId, userId), isNotNull(applications.fit)));
  });
}

/** Whether a stored score still reflects the profile and the rubric. */
export function fitIsCurrent(
  fit: Pick<StoredFit, "promptVersion"> | null,
  scoredAt: Date | null,
  profileUpdatedAt: Date | null,
): boolean {
  return (
    fit !== null &&
    scoredAt !== null &&
    profileUpdatedAt !== null &&
    fit.promptVersion === FIT_PROMPT_VERSION &&
    scoredAt >= profileUpdatedAt
  );
}

/**
 * Scores one application against the profile and stores the result.
 * Needs a profile and a description; returns null when either is missing.
 */
export async function scoreApplication(
  userId: string,
  applicationId: string,
  {
    scorer = defaultFitScorer(),
    now = new Date(),
  }: { scorer?: FitScorer | null; now?: Date } = {},
  db: Database = getDb(),
): Promise<StoredFit | null> {
  if (!scorer) throw new FitUnavailableError();
  const [application] = await db
    .select({
      companyName: applications.companyName,
      jobTitle: applications.jobTitle,
      location: applications.location,
      description: applications.jobDescription,
    })
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    );
  if (!application) throw new NotFoundError("Application");
  const record = await getResumeProfile(userId, db);
  if (!record || !application.description) return null;

  await spend(`fit:${userId}`, FIT_DAILY_LIMIT, now, db);
  const posting = { ...application, description: application.description };
  const call = await scorer({
    profile: record.profile,
    preferences: record.preferences,
    posting,
  });
  const fit: StoredFit = {
    ...computeFit(call.output, fitPostingText(posting)),
    model: call.model,
    promptVersion: FIT_PROMPT_VERSION,
    costUsd: call.costUsd,
  };
  // Only if the posting is still the one that was scored.
  await db
    .update(applications)
    .set({ fitScore: fit.score, fit, fitScoredAt: now })
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.jobDescription, application.description),
      ),
    );
  return fit;
}

/**
 * Scores an application in the background when it has no current score
 * and there is something to score with. Never throws.
 */
export async function scoreApplicationQuietly(
  userId: string,
  applicationId: string,
  {
    scorer = defaultFitScorer(),
    now = new Date(),
  }: { scorer?: FitScorer | null; now?: Date } = {},
  db: Database = getDb(),
): Promise<void> {
  if (!scorer) return;
  try {
    const [application] = await db
      .select({
        fit: applications.fit,
        scoredAt: applications.fitScoredAt,
        description: applications.jobDescription,
      })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId),
        ),
      );
    const record = await getResumeProfile(userId, db);
    if (
      !application?.description ||
      !record ||
      fitIsCurrent(application.fit, application.scoredAt, record.updatedAt)
    ) {
      return;
    }
    await scoreApplication(userId, applicationId, { scorer, now }, db);
  } catch (error) {
    console.error("fit_score_failed", {
      error: error instanceof Error ? error.name : "unknown",
      ...(error instanceof LlmUnavailableError ? { code: error.code } : {}),
    });
  }
}

/**
 * Scores applications that have a description but no current score, saved
 * jobs first, a few at a time. Stops at the daily limit or a model outage.
 */
export async function scoreUnscoredApplications(
  userId: string,
  {
    scorer = defaultFitScorer(),
    now = new Date(),
    limit = 25,
    concurrency = 4,
  }: {
    scorer?: FitScorer | null;
    now?: Date;
    limit?: number;
    concurrency?: number;
  } = {},
  db: Database = getDb(),
): Promise<{ scored: number }> {
  if (!scorer) throw new FitUnavailableError();
  const record = await getResumeProfile(userId, db);
  if (!record) return { scored: 0 };

  const pending = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        isNotNull(applications.jobDescription),
        or(
          isNull(applications.fitScoredAt),
          lt(applications.fitScoredAt, record.updatedAt),
          sql`${applications.fit} ->> 'promptVersion' is distinct from ${FIT_PROMPT_VERSION}`,
        ),
      ),
    )
    .orderBy(
      desc(sql`${applications.currentStatus} = 'SAVED'`),
      asc(applications.createdAt),
    )
    .limit(limit);

  let scored = 0;
  let stopped = false;
  const queue = [...pending];
  const worker = async () => {
    for (let next = queue.shift(); next && !stopped; next = queue.shift()) {
      try {
        if (await scoreApplication(userId, next.id, { scorer, now }, db)) {
          scored++;
        }
      } catch (error) {
        if (
          error instanceof FitLimitError ||
          error instanceof LlmUnavailableError
        ) {
          stopped = true;
          console.error("fit_batch_stopped", {
            error: error.name,
            ...(error instanceof LlmUnavailableError
              ? { code: error.code }
              : {}),
          });
          return;
        }
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { scored };
}
