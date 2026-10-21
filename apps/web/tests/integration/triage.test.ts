import type { FitOutput, ResumeProfile } from "@trackr/domain";
import { ZodError } from "zod";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  LlmUnavailableError,
  type FitScorer,
} from "@/server/integrations/anthropic";
import { createApplication } from "@/server/services/applications";
import {
  FIT_DAILY_LIMIT,
  saveResumeProfile,
  scoreApplication,
} from "@/server/services/fit";
import { triagePostings } from "@/server/services/triage";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date();

const PROFILE: ResumeProfile = {
  headline: "Junior backend engineer",
  seniority: "ENTRY",
  yearsExperience: 1,
  skills: [{ name: "TypeScript", evidence: "WORK", detail: "Intern" }],
  domains: ["fintech"],
  education: null,
};

const DESCRIPTION = `Build payment APIs in TypeScript and Postgres for our merchants.
Requirements: 1+ years of backend experience, strong TypeScript, comfort with SQL.
We're a fintech company. Remote in Canada. Salary: $100,000 to $120,000.`;

const RATING = {
  rating: "FULL" as const,
  stated: true,
  evidence: null,
  reason: "Matches.",
};
const RATINGS: FitOutput = {
  skills: { ...RATING, evidence: "Build payment APIs in TypeScript" },
  seniority: { ...RATING, evidence: "1+ years of backend experience" },
  domain: { ...RATING, evidence: "We're a fintech company" },
  practical: { ...RATING, evidence: "Remote in Canada" },
  gaps: [],
  summary: "A match.",
};

const scorer = (): FitScorer =>
  vi.fn(async () => ({
    output: RATINGS,
    model: "claude-haiku-5-5",
    inputTokens: 2000,
    outputTokens: 300,
    costUsd: 0.0004,
    latencyMs: 800,
  }));

const posting = (fields: Record<string, unknown> = {}) => ({
  url: "https://jobs.lever.co/northwind/2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13",
  companyName: "Northwind Labs",
  jobTitle: "Backend Engineer",
  location: "Remote, Canada",
  platform: "LEVER",
  atsJobId: "2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13",
  description: DESCRIPTION,
  ...fields,
});

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
  await saveResumeProfile(
    userId,
    { pdf: Buffer.from("%PDF-1.7\n"), filename: null },
    {
      reader: async () => ({
        output: PROFILE,
        model: "claude-haiku-5-5",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
        latencyMs: 1,
      }),
      now: daysAgo(1),
    },
    testDb.db,
  );
});

const triage = (postings: unknown[], score: FitScorer = scorer()) =>
  triagePostings(userId, { postings }, { scorer: score, now }, testDb.db);

describe("triagePostings", () => {
  it("scores each posting, in the order sent", async () => {
    const result = await triage([
      posting(),
      posting({ url: "https://example.com/jobs/2", description: "Too short." }),
    ]);
    expect(result.hasProfile).toBe(true);
    expect(result.results).toEqual([
      expect.objectContaining({
        status: "SCORED",
        fit: expect.objectContaining({ score: 100, label: "STRONG" }),
        trackedApplicationId: null,
      }),
      expect.objectContaining({
        url: "https://example.com/jobs/2",
        status: "NO_DESCRIPTION",
        fit: null,
      }),
    ]);
  });

  it("asks the model only once about the same posting", async () => {
    const score = scorer();
    await triage([posting()], score);
    await triage([posting()], score);
    expect(score).toHaveBeenCalledTimes(1);
  });

  it("reuses the triage score when the job is saved", async () => {
    const score = scorer();
    await triage([posting()], score);
    const { id } = await createApplication(
      userId,
      {
        companyName: "Northwind Labs",
        jobTitle: "Backend Engineer",
        location: "Remote, Canada",
        jobDescription: DESCRIPTION,
        status: "SAVED",
      },
      testDb.db,
    );
    const fit = await scoreApplication(
      userId,
      id,
      { scorer: score, now },
      testDb.db,
    );
    expect(fit?.score).toBe(100);
    expect(score).toHaveBeenCalledTimes(1);
  });

  it("says which postings are already tracked", async () => {
    const { id } = await createApplication(
      userId,
      {
        companyName: "Northwind Labs",
        jobTitle: "Backend Engineer",
        jobUrl:
          "https://jobs.lever.co/northwind/2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13",
        sourcePlatform: "LEVER",
        status: "SAVED",
      },
      testDb.db,
    );
    const result = await triage([posting()]);
    expect(result.results[0]?.trackedApplicationId).toBe(id);
  });

  it("returns nothing without a resume profile", async () => {
    userId = await createTestUser(testDb.db);
    const score = scorer();
    expect(await triage([posting()], score)).toEqual({
      hasProfile: false,
      results: [],
    });
    expect(score).not.toHaveBeenCalled();
  });

  it("stops asking once the model is down, and says why", async () => {
    const down: FitScorer = vi.fn(async () => {
      throw new LlmUnavailableError("api_529");
    });
    const result = await triagePostings(
      userId,
      {
        postings: [
          posting(),
          posting({ url: "https://example.com/2", jobTitle: "Data Engineer" }),
        ],
      },
      { scorer: down, now, concurrency: 1 },
      testDb.db,
    );
    expect(result.results.map((item) => item.status)).toEqual([
      "UNAVAILABLE",
      "UNAVAILABLE",
    ]);
    expect(down).toHaveBeenCalledTimes(1);
  });

  it("stops at the day's scoring allowance", async () => {
    const postings = Array.from({ length: 30 }, (_, i) =>
      posting({
        url: `https://example.com/jobs/${i}`,
        description: `${DESCRIPTION} Posting ${i}.`,
      }),
    );
    const score = scorer();
    for (let start = 0; start < FIT_DAILY_LIMIT; start += 30) {
      await triagePostings(
        userId,
        {
          postings: postings.map((item, i) => ({
            ...item,
            description: `${DESCRIPTION} Batch ${start} posting ${i}.`,
          })),
        },
        { scorer: score, now },
        testDb.db,
      );
    }
    const result = await triage(postings, score);
    expect(result.results.every((item) => item.status === "LIMIT")).toBe(true);
  });

  it("turns away malformed requests", async () => {
    await expect(triage([])).rejects.toBeInstanceOf(ZodError);
    await expect(
      triage([posting({ url: "javascript:alert(1)" })]),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
