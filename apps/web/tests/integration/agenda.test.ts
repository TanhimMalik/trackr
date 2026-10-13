import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "@/server/db/schema";
import { getAgenda } from "@/server/services/agenda";
import { createApplication } from "@/server/services/applications";
import { processApplicationEvent } from "@/server/services/events";
import { generateFollowUpReminders } from "@/server/services/reminders";
import { updateFollowUpSettings } from "@/server/services/settings";
import { seedDemoWorkspace } from "@/server/services/demo-workspace";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date();

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
});

describe("getAgenda", () => {
  it("is empty for a new account", async () => {
    expect(await getAgenda(userId, { now }, testDb.db)).toEqual({
      interviews: [],
      followUps: [],
      reviews: 0,
    });
  });

  it("lists upcoming interviews soonest first, and what waits for review", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const agenda = await getAgenda(userId, { now }, testDb.db);

    expect(agenda.interviews.length).toBeGreaterThan(0);
    const times = agenda.interviews.map((interview) => interview.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.every((time) => time >= now.getTime())).toBe(true);
    // The demo starts with one email Trackr wasn't sure about.
    expect(agenda.reviews).toBe(1);
  });

  describe("follow-ups", () => {
    let applicationId: string;
    beforeEach(async () => {
      ({ id: applicationId } = await createApplication(
        userId,
        { companyName: "Initech", jobTitle: "Analyst", appliedAt: daysAgo(20) },
        testDb.db,
      ));
    });

    it("stay listed after their reminder is read", async () => {
      await generateFollowUpReminders(
        userId,
        { now, afterDays: 14 },
        testDb.db,
      );
      await testDb.db
        .update(notifications)
        .set({ readAt: now })
        .where(eq(notifications.userId, userId));
      const { followUps } = await getAgenda(userId, { now }, testDb.db);
      expect(followUps).toEqual([
        expect.objectContaining({ applicationId, companyName: "Initech" }),
      ]);
    });

    it("go away once a follow-up is logged", async () => {
      await processApplicationEvent(
        {
          userId,
          applicationId,
          type: "FOLLOW_UP_SENT",
          occurredAt: daysAgo(1),
          sourceType: "MANUAL",
          dedupeKey: "manual:follow-up",
        },
        testDb.db,
      );
      expect((await getAgenda(userId, { now }, testDb.db)).followUps).toEqual(
        [],
      );
    });

    it("aren't listed with reminders off", async () => {
      await updateFollowUpSettings(
        userId,
        { enabled: false, afterDays: 14 },
        testDb.db,
      );
      expect((await getAgenda(userId, { now }, testDb.db)).followUps).toEqual(
        [],
      );
    });
  });
});
