import type { FitOutput, ResumeProfile } from "@trackr/domain";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { applications, fitCache } from "@/server/db/schema";
import {
  LlmUnavailableError,
  type FitScorer,
  type ResumeReader,
} from "@/server/integrations/anthropic";
import {
  createApplication,
  updateApplication,
} from "@/server/services/applications";
import {
  deleteResumeProfile,
  FIT_DAILY_LIMIT,
  FitLimitError,
  fitIsCurrent,
  getResumeProfile,
  ResumeUnreadableError,
  saveResumeProfile,
  scoreApplication,
  scoreApplicationQuietly,
  scoreUnscoredApplications,
  updateFitPreferences,
} from "@/server/services/fit";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date();
const PDF = Buffer.from("%PDF-1.7\n% a resume\n");

const PROFILE: ResumeProfile = {
  headline: "Junior backend engineer",
  seniority: "ENTRY",
  yearsExperience: 1,
  skills: [
    { name: "TypeScript", evidence: "WORK", detail: "Backend intern" },
    { name: "Kafka", evidence: "COURSE", detail: "Distributed systems class" },
  ],
  domains: ["fintech"],
  education: "BSc Computer Science",
};

const DESCRIPTION =
  "Build payment APIs in TypeScript. Requirements: 1+ years of backend experience. We're a fintech company in Toronto.";

const call = <T>(output: T) => ({
  output,
  model: "claude-haiku-5-5",
  inputTokens: 2000,
  outputTokens: 300,
  costUsd: 0.00035,
  latencyMs: 900,
});

const reader = (profile: ResumeProfile = PROFILE): ResumeReader =>
  vi.fn(async () => call(profile));

const RATINGS: FitOutput = {
  skills: {
    rating: "STRONG",
    stated: true,
    evidence: "payment APIs in TypeScript",
    reason: "You've used TypeScript at work.",
  },
  seniority: {
    rating: "FULL",
    stated: true,
    evidence: "1+ years of backend experience",
    reason: "Matches your experience.",
  },
  domain: {
    rating: "FULL",
    stated: true,
    evidence: "We're a fintech company",
    reason: "You've worked in fintech.",
  },
  practical: {
    rating: "PARTIAL",
    stated: false,
    evidence: null,
    reason: "The posting doesn't give the pay.",
  },
  gaps: ["Kafka in production"],
  summary: "A close match.",
};
const scorer = (): FitScorer => vi.fn(async () => call(RATINGS));

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
});

const addJob = (fields: { description?: string; status?: "SAVED" } = {}) =>
  createApplication(
    userId,
    {
      companyName: "Northwind Labs",
      jobTitle: "Backend Engineer",
      location: "Toronto",
      jobDescription: fields.description ?? DESCRIPTION,
      status: fields.status ?? "APPLIED",
      appliedAt: daysAgo(2),
    },
    testDb.db,
  );

const stored = async (id: string) => {
  const [row] = await testDb.db
    .select()
    .from(applications)
    .where(eq(applications.id, id));
  return row!;
};

describe("saveResumeProfile", () => {
  it("keeps the profile, not the file", async () => {
    const read = reader();
    const record = await saveResumeProfile(
      userId,
      { pdf: PDF, filename: "resume.pdf" },
      { reader: read, now },
      testDb.db,
    );
    expect(read).toHaveBeenCalledWith(PDF);
    expect(record).toMatchObject({
      profile: PROFILE,
      preferences: { workMode: "ANY", locations: null, minSalary: null },
      sourceFilename: "resume.pdf",
    });
    expect(await getResumeProfile(userId, testDb.db)).toMatchObject({
      profile: PROFILE,
    });
  });

  it("turns away files that aren't PDFs", async () => {
    await expect(
      saveResumeProfile(
        userId,
        { pdf: Buffer.from("hello"), filename: "resume.txt" },
        { reader: reader(), now },
        testDb.db,
      ),
    ).rejects.toEqual(new ResumeUnreadableError("not_pdf"));
  });

  it("says so when the model can't read it", async () => {
    const failing: ResumeReader = vi.fn(async () => {
      throw new LlmUnavailableError("invalid_output");
    });
    await expect(
      saveResumeProfile(
        userId,
        { pdf: PDF, filename: null },
        { reader: failing, now },
        testDb.db,
      ),
    ).rejects.toEqual(new ResumeUnreadableError("unreadable"));
  });
});

describe("scoreApplication", () => {
  beforeEach(async () => {
    await saveResumeProfile(
      userId,
      { pdf: PDF, filename: null },
      { reader: reader(), now: daysAgo(1) },
      testDb.db,
    );
  });

  it("stores the score worked out from the model's ratings", async () => {
    const { id } = await addJob();
    const score = scorer();
    const fit = await scoreApplication(
      userId,
      id,
      { scorer: score, now },
      testDb.db,
    );
    // 30 + 25 + 20 + 4 (not stated: held low)
    expect(fit).toMatchObject({ score: 79, label: "STRONG" });
    expect(await stored(id)).toMatchObject({
      fitScore: 79,
      fit: expect.objectContaining({ model: "claude-haiku-5-5" }),
    });
    // The prompt carries the profile and the posting.
    expect(score).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: PROFILE,
        posting: expect.objectContaining({ description: DESCRIPTION }),
      }),
    );
  });

  it("does nothing without a description", async () => {
    const { id } = await addJob({ description: "" });
    const score = scorer();
    expect(
      await scoreApplication(userId, id, { scorer: score, now }, testDb.db),
    ).toBeNull();
    expect(score).not.toHaveBeenCalled();
  });

  it("clears the score when the description changes", async () => {
    const { id } = await addJob();
    await scoreApplication(userId, id, { scorer: scorer(), now }, testDb.db);
    await updateApplication(
      userId,
      id,
      { jobDescription: "A different posting." },
      testDb.db,
    );
    expect(await stored(id)).toMatchObject({ fitScore: null, fit: null });
  });

  it("goes stale when the profile or preferences change", async () => {
    const { id } = await addJob();
    await scoreApplication(userId, id, { scorer: scorer(), now }, testDb.db);
    const row = await stored(id);
    let profile = await getResumeProfile(userId, testDb.db);
    expect(fitIsCurrent(row.fit, row.fitScoredAt, profile!.updatedAt)).toBe(
      true,
    );
    await updateFitPreferences(
      userId,
      { locations: "Toronto", workMode: "HYBRID", minSalary: 90_000 },
      { now: new Date(now.getTime() + 1000) },
      testDb.db,
    );
    profile = await getResumeProfile(userId, testDb.db);
    expect(fitIsCurrent(row.fit, row.fitScoredAt, profile!.updatedAt)).toBe(
      false,
    );
  });

  it("in the background, leaves a current score alone", async () => {
    const { id } = await addJob();
    const score = scorer();
    await scoreApplicationQuietly(
      userId,
      id,
      { scorer: score, now },
      testDb.db,
    );
    await scoreApplicationQuietly(
      userId,
      id,
      { scorer: score, now },
      testDb.db,
    );
    expect(score).toHaveBeenCalledTimes(1);
    expect((await stored(id)).fitScore).toBe(79);
  });

  it("stops at the daily limit", async () => {
    // Different postings each time: the same one would come from the cache.
    for (let i = 0; i < FIT_DAILY_LIMIT; i++) {
      const { id } = await addJob({ description: `${DESCRIPTION} (${i})` });
      await scoreApplication(userId, id, { scorer: scorer(), now }, testDb.db);
    }
    const { id } = await addJob({ description: `${DESCRIPTION} (last)` });
    await expect(
      scoreApplication(userId, id, { scorer: scorer(), now }, testDb.db),
    ).rejects.toBeInstanceOf(FitLimitError);
  });
});

describe("scoreUnscoredApplications", () => {
  it("scores what has a description and no current score, saved jobs first", async () => {
    await saveResumeProfile(
      userId,
      { pdf: PDF, filename: null },
      { reader: reader(), now: daysAgo(1) },
      testDb.db,
    );
    const applied = await addJob();
    const saved = await addJob({
      status: "SAVED",
      description: `${DESCRIPTION} Saved for later.`,
    });
    await addJob({ description: "" });
    const score = scorer();
    const order: string[] = [];
    const tracking: FitScorer = async (input) => {
      order.push(input.posting.description);
      return score(input);
    };
    const result = await scoreUnscoredApplications(
      userId,
      { scorer: tracking, now, concurrency: 1 },
      testDb.db,
    );
    expect(result).toEqual({ scored: 2 });
    expect(order[0]).toContain("Saved for later.");
    expect((await stored(saved.id)).fitScore).toBe(79);
    expect((await stored(applied.id)).fitScore).toBe(79);

    // Nothing left to do on a second run.
    expect(
      await scoreUnscoredApplications(
        userId,
        { scorer: score, now },
        testDb.db,
      ),
    ).toEqual({ scored: 0 });
  });

  it("stops quietly when the model is down", async () => {
    await saveResumeProfile(
      userId,
      { pdf: PDF, filename: null },
      { reader: reader(), now: daysAgo(1) },
      testDb.db,
    );
    await addJob();
    await addJob();
    const down: FitScorer = vi.fn(async () => {
      throw new LlmUnavailableError("api_529");
    });
    expect(
      await scoreUnscoredApplications(
        userId,
        { scorer: down, now, concurrency: 1 },
        testDb.db,
      ),
    ).toEqual({ scored: 0 });
    expect(down).toHaveBeenCalledTimes(1);
  });
});

describe("deleteResumeProfile", () => {
  it("forgets the profile and every score", async () => {
    await saveResumeProfile(
      userId,
      { pdf: PDF, filename: null },
      { reader: reader(), now: daysAgo(1) },
      testDb.db,
    );
    const { id } = await addJob();
    await scoreApplication(userId, id, { scorer: scorer(), now }, testDb.db);
    await deleteResumeProfile(userId, testDb.db);
    expect(await getResumeProfile(userId, testDb.db)).toBeNull();
    expect(
      await testDb.db
        .select()
        .from(fitCache)
        .where(eq(fitCache.userId, userId)),
    ).toHaveLength(0);
    expect(await stored(id)).toMatchObject({ fitScore: null, fit: null });
  });
});
