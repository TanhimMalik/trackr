import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applicationEvents } from "@/server/db/schema";
import { listRecentAutomation } from "@/server/services/activity";
import {
  getOverviewAnalytics,
  loadApplicationProgress,
} from "@/server/services/analytics";
import { createApplication } from "@/server/services/applications";
import {
  processApplicationEvent,
  recomputeApplicationState,
} from "@/server/services/events";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
});

const apply = (companyName: string, days: number, owner = userId) =>
  createApplication(
    owner,
    { companyName, jobTitle: "Software Engineer", appliedAt: daysAgo(days) },
    testDb.db,
  );

const email = (
  applicationId: string,
  type: Parameters<typeof processApplicationEvent>[0]["type"],
  days: number,
  owner = userId,
) =>
  processApplicationEvent(
    {
      userId: owner,
      applicationId,
      type,
      occurredAt: daysAgo(days),
      sourceType: "EMAIL",
      confidence: 0.95,
      dedupeKey: `email:${crypto.randomUUID()}`,
    },
    testDb.db,
  );

describe("loadApplicationProgress", () => {
  it("summarizes each application from its own events", async () => {
    const ramp = await apply("Ramp", 20);
    await email(ramp.id, "INTERVIEW_REQUESTED", 6);
    await apply("Figma", 10);
    await createApplication(
      userId,
      { companyName: "Notion", jobTitle: "Engineer", status: "SAVED" },
      testDb.db,
    );

    const progress = await loadApplicationProgress(userId, testDb.db);

    expect(progress).toHaveLength(3);
    const interviewed = progress.filter((p) => p.reachedInterview);
    expect(interviewed).toHaveLength(1);
    const interviewAt = interviewed[0]!.interviewAt!.getTime();
    expect(Math.abs(interviewAt - daysAgo(6).getTime())).toBeLessThan(60_000);
    expect(progress.filter((p) => p.appliedAt === null)).toHaveLength(1);
  });

  it("ignores undone events", async () => {
    const vercel = await apply("Vercel", 12);
    const { event } = await email(vercel.id, "REJECTION_RECEIVED", 3);
    await testDb.db
      .update(applicationEvents)
      .set({ revertedAt: new Date() })
      .where(eq(applicationEvents.id, event.id));
    await testDb.db.transaction((tx) =>
      recomputeApplicationState(tx, userId, vercel.id),
    );

    const [progress] = await loadApplicationProgress(userId, testDb.db);
    expect(progress!.firstResponseAt).toBeNull();
    expect(progress!.rejected).toBe(false);
  });

  it("only reads the user's own applications", async () => {
    const someoneElse = await createTestUser(testDb.db);
    await apply("Stripe", 5, someoneElse);

    expect(await loadApplicationProgress(userId, testDb.db)).toEqual([]);
  });
});

describe("getOverviewAnalytics", () => {
  it("computes the summary metrics and a funnel per period", async () => {
    const stripe = await apply("Stripe", 50);
    await email(stripe.id, "INTERVIEW_REQUESTED", 40);
    await email(stripe.id, "OFFER_RECEIVED", 4);
    const ramp = await apply("Ramp", 20);
    await email(ramp.id, "ASSESSMENT_RECEIVED", 15);
    await apply("Figma", 2);

    const { metrics, funnels } = await getOverviewAnalytics(userId, testDb.db);

    expect(metrics.applications).toMatchObject({
      total: 3,
      recent: 2,
      previous: 1,
    });
    expect(metrics.interviews).toMatchObject({ total: 1, recent: 0 });
    expect(metrics.offers).toMatchObject({ total: 1, recent: 1 });
    expect(metrics.responseRate).toMatchObject({
      numerator: 2,
      denominator: 3,
    });
    expect(funnels["30d"]).toMatchObject({ applications: 2, responses: 1 });
    expect(funnels.all).toMatchObject({
      applications: 3,
      responses: 2,
      interviews: 1,
      offers: 1,
    });
  });
});

describe("listRecentAutomation", () => {
  it("lists automatic updates newest first with their application", async () => {
    const ramp = await apply("Ramp", 20);
    await email(ramp.id, "RECRUITER_CONTACT", 9);
    await email(ramp.id, "INTERVIEW_REQUESTED", 2);
    const figma = await apply("Figma", 10);
    await email(figma.id, "ASSESSMENT_RECEIVED", 5);

    const items = await listRecentAutomation(userId, 6, testDb.db);

    expect(items.map((item) => item.eventType)).toEqual([
      "INTERVIEW_REQUESTED",
      "ASSESSMENT_RECEIVED",
      "RECRUITER_CONTACT",
    ]);
    expect(items[0]).toMatchObject({
      sourceType: "EMAIL",
      statusBefore: "RECRUITER_SCREEN",
      statusAfter: "INTERVIEW",
      application: { id: ramp.id, companyName: "Ramp" },
    });
  });

  it("leaves out manual changes, undone updates and other users", async () => {
    const ramp = await apply("Ramp", 20);
    const { event } = await email(ramp.id, "REJECTION_RECEIVED", 3);
    await testDb.db
      .update(applicationEvents)
      .set({ revertedAt: new Date() })
      .where(eq(applicationEvents.id, event.id));
    const someoneElse = await createTestUser(testDb.db);
    const theirs = await apply("Stripe", 8, someoneElse);
    await email(theirs.id, "INTERVIEW_REQUESTED", 1, someoneElse);

    expect(await listRecentAutomation(userId, 6, testDb.db)).toEqual([]);
  });

  it("respects the limit", async () => {
    const ramp = await apply("Ramp", 20);
    for (const days of [9, 7, 5, 3]) {
      await email(ramp.id, "RECRUITER_CONTACT", days);
    }

    expect(await listRecentAutomation(userId, 2, testDb.db)).toHaveLength(2);
  });
});
