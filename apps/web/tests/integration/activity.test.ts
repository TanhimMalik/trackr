import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApplication } from "@/server/services/applications";
import { listActivity } from "@/server/services/activity";
import {
  processApplicationEvent,
  revertEvent,
  type ApplicationEventInput,
} from "@/server/services/events";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
let applicationId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
  const application = await createApplication(
    userId,
    { companyName: "Ramp", jobTitle: "Engineer", appliedAt: daysAgo(20) },
    testDb.db,
  );
  applicationId = application.id;
});

const record = (event: Partial<ApplicationEventInput>) =>
  processApplicationEvent(
    {
      userId,
      applicationId,
      type: "RECRUITER_CONTACT",
      occurredAt: daysAgo(5),
      sourceType: "EMAIL",
      dedupeKey: `email:${crypto.randomUUID()}`,
      ...event,
    },
    testDb.db,
  );

const types = (items: { eventType: string }[]) =>
  items.map((item) => item.eventType);

describe("listActivity", () => {
  it("lists every application's events, newest first", async () => {
    await record({ type: "INTERVIEW_REQUESTED", occurredAt: daysAgo(3) });
    await record({ type: "RECRUITER_CONTACT", occurredAt: daysAgo(8) });

    const { items, next } = await listActivity(userId, {}, testDb.db);
    expect(types(items)).toEqual([
      "INTERVIEW_REQUESTED",
      "RECRUITER_CONTACT",
      "APPLICATION_SUBMITTED",
    ]);
    expect(items[0]!.application).toMatchObject({
      id: applicationId,
      companyName: "Ramp",
      activeEvents: 3,
    });
    expect(next).toBeNull();
  });

  it("filters by source", async () => {
    await record({});

    const automatic = await listActivity(
      userId,
      { source: "automatic" },
      testDb.db,
    );
    const manual = await listActivity(userId, { source: "manual" }, testDb.db);
    expect(types(automatic.items)).toEqual(["RECRUITER_CONTACT"]);
    expect(types(manual.items)).toEqual(["APPLICATION_SUBMITTED"]);
  });

  it("pages through older activity without gaps or repeats", async () => {
    for (let day = 1; day <= 4; day++) {
      // Two events at the same moment exercise the tie-breakers.
      await record({ occurredAt: daysAgo(day) });
      await record({ occurredAt: daysAgo(day) });
    }

    const seen: string[] = [];
    let before = null;
    do {
      const page = await listActivity(userId, { before, limit: 3 }, testDb.db);
      seen.push(...page.items.map((item) => item.id));
      before = page.next;
    } while (before);

    expect(seen).toHaveLength(9);
    expect(new Set(seen).size).toBe(9);
  });

  it("keeps undone events so they can be restored", async () => {
    const { event } = await record({});
    await revertEvent(userId, event.id, testDb.db);

    const { items } = await listActivity(userId, {}, testDb.db);
    expect(items[0]).toMatchObject({ id: event.id });
    expect(items[0]!.revertedAt).not.toBeNull();
    expect(items[0]!.application.activeEvents).toBe(1);

    const active = await listActivity(
      userId,
      { includeReverted: false },
      testDb.db,
    );
    expect(types(active.items)).toEqual(["APPLICATION_SUBMITTED"]);
  });

  it("only shows the user's own activity", async () => {
    await record({});
    const stranger = await createTestUser(testDb.db);

    expect((await listActivity(stranger, {}, testDb.db)).items).toEqual([]);
  });
});
