import { boardColumnForStatus } from "@trackr/domain";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applicationEvents, applications } from "@/server/db/schema";
import { listApplications } from "@/server/services/applications";
import {
  seedDemoWorkspace,
  WorkspaceNotEmptyError,
} from "@/server/services/demo-workspace";
import { recomputeApplicationState } from "@/server/services/events";
import { DEMO_APPLICATIONS } from "@/server/demo/applications";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date("2026-10-07T18:30:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
});

const eventsOf = (applicationId: string) =>
  testDb.db
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, applicationId))
    .orderBy(asc(applicationEvents.eventTimestamp));

describe("seedDemoWorkspace", () => {
  it("creates about 20 applications with their histories", async () => {
    const result = await seedDemoWorkspace(userId, { now }, testDb.db);

    expect(result.applications).toBe(DEMO_APPLICATIONS.length);
    expect(result.applications).toBeGreaterThanOrEqual(18);
    const rows = await listApplications(userId, testDb.db);
    expect(rows).toHaveLength(result.applications);
    const events = await testDb.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.userId, userId));
    expect(events).toHaveLength(result.events);
  });

  it("fills every board column", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const rows = await listApplications(userId, testDb.db);
    const columns = new Set(
      rows.map((row) => boardColumnForStatus(row.currentStatus)),
    );
    expect(columns).toEqual(
      new Set([
        "saved",
        "applied",
        "assessment",
        "interview",
        "offer",
        "closed",
      ]),
    );
  });

  it("stores exactly the state the event processor derives", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const seeded = await listApplications(userId, testDb.db);

    for (const application of seeded) {
      const before = await eventsOf(application.id);
      await testDb.db.transaction((tx) =>
        recomputeApplicationState(tx, userId, application.id),
      );
      const [after] = await testDb.db
        .select()
        .from(applications)
        .where(eq(applications.id, application.id));

      expect(after, application.companyName).toMatchObject({
        currentStatus: application.currentStatus,
        appliedAt: application.appliedAt,
        lastActivityAt: application.lastActivityAt,
      });
      expect(await eventsOf(application.id)).toEqual(before);
    }
  });

  it("dates everything in the recent past relative to the seed date", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const events = await testDb.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.userId, userId));

    for (const event of events) {
      expect(event.eventTimestamp.getTime()).toBeLessThan(now.getTime());
      expect(event.createdAt.getTime()).toBeLessThan(now.getTime());
      expect(now.getTime() - event.eventTimestamp.getTime()).toBeLessThan(
        60 * DAY_MS,
      );
    }

    const discord = (await listApplications(userId, testDb.db)).find(
      (row) => row.companyName === "Discord",
    );
    expect(discord!.appliedAt).toEqual(new Date("2026-10-05T15:00:00Z"));
  });

  it("gives every company a domain for its logo", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const rows = await listApplications(userId, testDb.db);
    expect(rows.filter((row) => !row.companyDomain)).toEqual([]);
    expect(rows.find((row) => row.companyName === "Datadog")).toMatchObject({
      companyDomain: "datadoghq.com",
      companyNameNorm: "datadog",
    });
  });

  it("mixes automatic and manual activity", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const events = await testDb.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.userId, userId));

    const sources = new Set(events.map((event) => event.sourceType));
    expect(sources).toEqual(new Set(["BROWSER_EXTENSION", "EMAIL", "MANUAL"]));
    for (const event of events.filter((e) => e.sourceType === "EMAIL")) {
      expect(event.classificationMethod).not.toBeNull();
      expect(event.confidence).toBeGreaterThan(0.5);
      // Detected a few minutes after the email arrived.
      expect(event.createdAt.getTime()).toBeGreaterThan(
        event.eventTimestamp.getTime(),
      );
    }
    expect(events.some((event) => event.classificationMethod === "LLM")).toBe(
      true,
    );
  });

  it("only seeds an empty workspace", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    await expect(seedDemoWorkspace(userId, { now }, testDb.db)).rejects.toThrow(
      WorkspaceNotEmptyError,
    );
    expect(await listApplications(userId, testDb.db)).toHaveLength(
      DEMO_APPLICATIONS.length,
    );
  });

  it("leaves other users untouched", async () => {
    const otherUser = await createTestUser(testDb.db);
    await seedDemoWorkspace(userId, { now }, testDb.db);
    expect(await listApplications(otherUser, testDb.db)).toEqual([]);
  });
});
