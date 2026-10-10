import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAgenda } from "@/server/services/agenda";
import { seedDemoWorkspace } from "@/server/services/demo-workspace";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

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
});
