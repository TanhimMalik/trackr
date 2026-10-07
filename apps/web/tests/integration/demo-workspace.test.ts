import { boardColumnForStatus } from "@trackr/domain";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applicationEvents, applications, users } from "@/server/db/schema";
import {
  countApplications,
  createApplication,
  listApplications,
} from "@/server/services/applications";
import {
  deleteDemoWorkspace,
  deleteExpiredDemoWorkspaces,
  DEMO_LIFETIME_HOURS,
  resetDemoWorkspace,
  seedDemoWorkspace,
  WorkspaceNotEmptyError,
} from "@/server/services/demo-workspace";
import { upsertUser, userExists } from "@/server/services/users";
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
    const rows = await listApplications(userId, {}, testDb.db);
    expect(rows).toHaveLength(result.applications);
    const events = await testDb.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.userId, userId));
    expect(events).toHaveLength(result.events);
  });

  it("fills every board column", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const rows = await listApplications(userId, {}, testDb.db);
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
    const seeded = await listApplications(userId, {}, testDb.db);

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

    const discord = (await listApplications(userId, {}, testDb.db)).find(
      (row) => row.companyName === "Discord",
    );
    expect(discord!.appliedAt).toEqual(new Date("2026-10-05T15:00:00Z"));
  });

  it("gives every company a domain for its logo", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);
    const rows = await listApplications(userId, {}, testDb.db);
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
    expect(await listApplications(userId, {}, testDb.db)).toHaveLength(
      DEMO_APPLICATIONS.length,
    );
  });

  it("leaves other users untouched", async () => {
    const otherUser = await createTestUser(testDb.db);
    await seedDemoWorkspace(userId, { now }, testDb.db);
    expect(await listApplications(otherUser, {}, testDb.db)).toEqual([]);
  });
});

const HOUR_MS = 60 * 60 * 1000;

async function createDemoUser(createdAt = now) {
  const id = crypto.randomUUID();
  await upsertUser({ id, email: null, name: null, isDemo: true }, testDb.db);
  await testDb.db.update(users).set({ createdAt }).where(eq(users.id, id));
  await seedDemoWorkspace(id, { now }, testDb.db);
  return id;
}

describe("resetDemoWorkspace", () => {
  it("replaces the workspace with fresh sample data", async () => {
    const id = await createDemoUser();
    await createApplication(
      id,
      { companyName: "Acme", jobTitle: "Engineer" },
      testDb.db,
    );

    await resetDemoWorkspace(id, { now }, testDb.db);

    const names = (await listApplications(id, {}, testDb.db)).map(
      (application) => application.companyName,
    );
    expect(names).not.toContain("Acme");
    expect(names).toHaveLength(DEMO_APPLICATIONS.length);
  });
});

describe("deleteDemoWorkspace", () => {
  it("deletes a demo account and everything in it", async () => {
    const id = await createDemoUser();

    await deleteDemoWorkspace(id, testDb.db);

    expect(await userExists(id, testDb.db)).toBe(false);
    expect(await countApplications(id, testDb.db)).toBe(0);
  });

  it("never deletes a real account", async () => {
    await seedDemoWorkspace(userId, { now }, testDb.db);

    await deleteDemoWorkspace(userId, testDb.db);

    expect(await userExists(userId, testDb.db)).toBe(true);
    expect(await countApplications(userId, testDb.db)).toBe(
      DEMO_APPLICATIONS.length,
    );
  });
});

describe("deleteExpiredDemoWorkspaces", () => {
  it("deletes demos older than their lifetime and nothing else", async () => {
    const lifetime = DEMO_LIFETIME_HOURS * HOUR_MS;
    const expired = await createDemoUser(
      new Date(now.getTime() - lifetime - HOUR_MS),
    );
    const current = await createDemoUser(
      new Date(now.getTime() - lifetime + HOUR_MS),
    );
    // A real account older than any demo.
    await testDb.db
      .update(users)
      .set({ createdAt: new Date(now.getTime() - 30 * DAY_MS) })
      .where(eq(users.id, userId));

    const result = await deleteExpiredDemoWorkspaces({ now }, testDb.db);

    expect(result.workspaces).toBeGreaterThanOrEqual(1);
    expect(await userExists(expired, testDb.db)).toBe(false);
    expect(await userExists(current, testDb.db)).toBe(true);
    expect(await userExists(userId, testDb.db)).toBe(true);
  });

  it("also deletes expired anonymous sign-ins when the auth schema exists", async () => {
    // A stand-in for Supabase's auth.users table.
    await testDb.client.exec(`
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key,
        is_anonymous boolean not null default false,
        created_at timestamptz not null
      );
    `);
    const old = new Date(now.getTime() - (DEMO_LIFETIME_HOURS + 1) * HOUR_MS);
    const anonymous = crypto.randomUUID();
    const permanent = crypto.randomUUID();
    const fresh = crypto.randomUUID();
    await testDb.client.query(
      `insert into auth.users (id, is_anonymous, created_at) values
        ($1, true, $4), ($2, false, $4), ($3, true, $5)`,
      [anonymous, permanent, fresh, old.toISOString(), now.toISOString()],
    );

    await deleteExpiredDemoWorkspaces({ now }, testDb.db);

    const { rows } = await testDb.client.query<{ id: string }>(
      "select id from auth.users order by id",
    );
    expect(rows.map((row) => row.id).sort()).toEqual([permanent, fresh].sort());
    await testDb.client.exec("drop schema auth cascade");
  });
});
