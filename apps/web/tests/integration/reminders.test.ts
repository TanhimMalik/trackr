import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applications, userSettings } from "@/server/db/schema";
import { createApplication } from "@/server/services/applications";
import { seedDemoWorkspace } from "@/server/services/demo-workspace";
import { createInterview } from "@/server/services/interviews";
import { listNotifications } from "@/server/services/notifications";
import {
  generateFollowUpReminders,
  refreshFollowUpReminders,
} from "@/server/services/reminders";
import {
  getFollowUpSettings,
  updateFollowUpSettings,
} from "@/server/services/settings";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date();
const HOUR_MS = 60 * 60 * 1000;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
});

const apply = (companyName: string, days: number) =>
  createApplication(
    userId,
    { companyName, jobTitle: "Engineer", appliedAt: daysAgo(days) },
    testDb.db,
  );

/** An application at the interview stage that last heard something `days` ago. */
async function interviewing(companyName: string, days: number) {
  const application = await apply(companyName, days);
  await testDb.db
    .update(applications)
    .set({ currentStatus: "INTERVIEW", lastActivityAt: daysAgo(days) })
    .where(eq(applications.id, application.id));
  return application;
}

const reminders = async () =>
  (await listNotifications(userId, {}, testDb.db)).filter(
    (item) => item.type === "FOLLOW_UP_DUE",
  );

describe("generateFollowUpReminders", () => {
  it("reminds about quiet applications once", async () => {
    await apply("Stripe", 16);
    await apply("Figma", 3);

    const generate = () =>
      generateFollowUpReminders(userId, { now, afterDays: 14 }, testDb.db);
    expect(await generate()).toBe(1);
    expect(await generate()).toBe(0);

    expect(await reminders()).toEqual([
      expect.objectContaining({
        title: "Stripe hasn't responded in 14 days",
        body: "Engineer",
        readAt: null,
      }),
    ]);
  });

  it("reminds about an interview nobody replied to", async () => {
    const application = await interviewing("Ramp", 10);
    await createInterview(
      userId,
      application.id,
      { scheduledAt: daysAgo(7).toISOString() },
      testDb.db,
    );

    await generateFollowUpReminders(userId, { now, afterDays: 14 }, testDb.db);
    expect((await reminders()).map((item) => item.title)).toEqual([
      "No reply from Ramp 5 days after your interview",
    ]);
  });

  it("ignores canceled interviews", async () => {
    const application = await interviewing("Ramp", 10);
    await createInterview(
      userId,
      application.id,
      { scheduledAt: daysAgo(7).toISOString(), status: "CANCELED" },
      testDb.db,
    );

    await generateFollowUpReminders(userId, { now, afterDays: 14 }, testDb.db);
    expect(await reminders()).toEqual([]);
  });
});

describe("refreshFollowUpReminders", () => {
  it("checks at most once an hour", async () => {
    await refreshFollowUpReminders(userId, { now }, testDb.db);
    await apply("Stripe", 16);

    await refreshFollowUpReminders(
      userId,
      { now: new Date(now.getTime() + 10 * 60 * 1000) },
      testDb.db,
    );
    expect(await reminders()).toEqual([]);

    await refreshFollowUpReminders(
      userId,
      { now: new Date(now.getTime() + 2 * HOUR_MS) },
      testDb.db,
    );
    expect(await reminders()).toHaveLength(1);
  });

  it("respects the user's settings", async () => {
    await apply("Stripe", 9);
    await updateFollowUpSettings(
      userId,
      { enabled: false, afterDays: 7 },
      testDb.db,
    );
    await refreshFollowUpReminders(userId, { now }, testDb.db);
    expect(await reminders()).toEqual([]);

    // Saving settings makes the next visit check again.
    await updateFollowUpSettings(
      userId,
      { enabled: true, afterDays: 7 },
      testDb.db,
    );
    await refreshFollowUpReminders(userId, { now }, testDb.db);
    expect((await reminders()).map((item) => item.title)).toEqual([
      "Stripe hasn't responded in 7 days",
    ]);
  });
});

describe("follow-up settings", () => {
  it("defaults to reminders after 14 days", async () => {
    expect(await getFollowUpSettings(userId, testDb.db)).toEqual({
      enabled: true,
      afterDays: 14,
    });
  });

  it("saves changes and rejects intervals that aren't offered", async () => {
    await updateFollowUpSettings(
      userId,
      { enabled: true, afterDays: 21 },
      testDb.db,
    );
    expect(await getFollowUpSettings(userId, testDb.db)).toEqual({
      enabled: true,
      afterDays: 21,
    });
    const [row] = await testDb.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    expect(row!.remindersCheckedAt).toBeNull();

    await expect(
      updateFollowUpSettings(
        userId,
        { enabled: true, afterDays: 3 },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("demo reminders", () => {
  it("includes follow-ups that came due recently", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const items = await reminders();

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.createdAt <= now)).toBe(true);
  });
});
