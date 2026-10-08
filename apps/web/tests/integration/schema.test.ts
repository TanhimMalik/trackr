import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  CLASSIFICATION_METHODS,
  CONTACT_TYPES,
  EMPLOYMENT_TYPES,
  EVENT_SOURCE_TYPES,
  INTERVIEW_STATUSES,
  INTERVIEW_TYPES,
  NOTIFICATION_TYPES,
  REVIEW_ITEM_KINDS,
  REVIEW_ITEM_STATES,
  REVIEW_RESOLUTIONS,
  SOURCE_PLATFORMS,
} from "@trackr/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applicationEvents,
  applications,
  resumeVersions,
  users,
} from "@/server/db/schema";
import {
  createTestDatabase,
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  postgresErrorCode,
  type TestDatabase,
} from "../helpers/database";

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

async function createUser() {
  const id = crypto.randomUUID();
  await testDb.db.insert(users).values({ id, email: `${id}@example.com` });
  return id;
}

async function createApplication(
  userId: string,
  values: Partial<typeof applications.$inferInsert> = {},
) {
  const [application] = await testDb.db
    .insert(applications)
    .values({
      userId,
      companyName: "Datadog",
      companyNameNorm: "datadog",
      jobTitle: "Software Engineer",
      jobTitleNorm: "software engineer",
      ...values,
    })
    .returning();
  return application!;
}

function eventValues(
  userId: string,
  applicationId: string,
  dedupeKey = `manual:${crypto.randomUUID()}`,
) {
  return {
    userId,
    applicationId,
    eventType: "APPLICATION_SUBMITTED" as const,
    eventTimestamp: new Date("2026-10-02T15:00:00Z"),
    sourceType: "MANUAL" as const,
    dedupeKey,
  };
}

describe("database schema", () => {
  it("enables row-level security on every table", async () => {
    const { rows } = await testDb.client.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual([
      "application_events",
      "applications",
      "contacts",
      "extension_sessions",
      "interviews",
      "notifications",
      "rate_limit_buckets",
      "resume_versions",
      "review_items",
      "user_settings",
      "users",
    ]);
    expect(rows.filter((row) => !row.relrowsecurity)).toEqual([]);
  });

  it.each([
    ["application_status", APPLICATION_STATUSES],
    ["application_event_type", APPLICATION_EVENT_TYPES],
    ["event_source_type", EVENT_SOURCE_TYPES],
    ["source_platform", SOURCE_PLATFORMS],
    ["application_source", APPLICATION_SOURCES],
    ["employment_type", EMPLOYMENT_TYPES],
    ["classification_method", CLASSIFICATION_METHODS],
    ["interview_type", INTERVIEW_TYPES],
    ["interview_status", INTERVIEW_STATUSES],
    ["contact_type", CONTACT_TYPES],
    ["notification_type", NOTIFICATION_TYPES],
    ["review_item_kind", REVIEW_ITEM_KINDS],
    ["review_item_state", REVIEW_ITEM_STATES],
    ["review_resolution", REVIEW_RESOLUTIONS],
  ])("mirrors the domain values in the %s enum", async (name, values) => {
    const { rows } = await testDb.client.query<{ label: string }>(
      `select e.enumlabel as label
       from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = $1 order by e.enumsortorder`,
      [name],
    );
    expect(rows.map((row) => row.label)).toEqual([...values]);
  });

  it("applies defaults to new applications", async () => {
    const application = await createApplication(await createUser());
    expect(application).toMatchObject({
      currentStatus: "UNKNOWN",
      sourcePlatform: "OTHER",
      appliedAt: null,
    });
    expect(application.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(application.lastActivityAt).toBeInstanceOf(Date);
  });
});

describe("application constraints", () => {
  it("rejects a second application for the same ATS job on the same platform", async () => {
    const userId = await createUser();
    const job = { sourcePlatform: "GREENHOUSE" as const, atsJobId: "4012345" };
    await createApplication(userId, job);

    expect(await postgresErrorCode(createApplication(userId, job))).toBe(
      PG_UNIQUE_VIOLATION,
    );
    // The same job id on another platform, or for another user, is fine.
    await createApplication(userId, { ...job, sourcePlatform: "LEVER" });
    await createApplication(await createUser(), job);
  });

  it("allows any number of applications without an ATS job id", async () => {
    const userId = await createUser();
    await createApplication(userId);
    await createApplication(userId);
    const rows = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it("validates salary values", async () => {
    const userId = await createUser();
    expect(
      await postgresErrorCode(
        createApplication(userId, { salaryMin: 150_000, salaryMax: 120_000 }),
      ),
    ).toBe(PG_CHECK_VIOLATION);
    expect(
      await postgresErrorCode(createApplication(userId, { salaryMin: -1 })),
    ).toBe(PG_CHECK_VIOLATION);
    expect(
      await postgresErrorCode(
        createApplication(userId, { salaryCurrency: "usd" }),
      ),
    ).toBe(PG_CHECK_VIOLATION);
    await createApplication(userId, {
      salaryMin: 120_000,
      salaryMax: 150_000,
      salaryCurrency: "USD",
    });
  });
});

describe("event constraints", () => {
  it("rejects a duplicate dedupe key for the same user", async () => {
    const userId = await createUser();
    const application = await createApplication(userId);
    const values = eventValues(userId, application.id, "email:msg-1");
    await testDb.db.insert(applicationEvents).values(values);

    expect(
      await postgresErrorCode(
        testDb.db.insert(applicationEvents).values(values),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);

    const inserted = await testDb.db
      .insert(applicationEvents)
      .values(values)
      .onConflictDoNothing()
      .returning();
    expect(inserted).toEqual([]);
  });

  it("allows the same dedupe key for different users", async () => {
    for (const userId of [await createUser(), await createUser()]) {
      const application = await createApplication(userId);
      await testDb.db
        .insert(applicationEvents)
        .values(eventValues(userId, application.id, "email:shared"));
    }
  });

  it("rejects an event that points at another user's application", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const application = await createApplication(owner);

    expect(
      await postgresErrorCode(
        testDb.db
          .insert(applicationEvents)
          .values(eventValues(intruder, application.id)),
      ),
    ).toBe(PG_FOREIGN_KEY_VIOLATION);
  });

  it("keeps confidence between 0 and 1", async () => {
    const userId = await createUser();
    const application = await createApplication(userId);
    expect(
      await postgresErrorCode(
        testDb.db
          .insert(applicationEvents)
          .values({ ...eventValues(userId, application.id), confidence: 1.2 }),
      ),
    ).toBe(PG_CHECK_VIOLATION);
  });

  it("stores metadata as JSON with an empty default", async () => {
    const userId = await createUser();
    const application = await createApplication(userId);
    const [plain] = await testDb.db
      .insert(applicationEvents)
      .values(eventValues(userId, application.id))
      .returning();
    const [override] = await testDb.db
      .insert(applicationEvents)
      .values({
        ...eventValues(userId, application.id),
        eventType: "STATUS_OVERRIDDEN",
        metadata: { toStatus: "INTERVIEW" },
      })
      .returning();
    expect(plain!.metadata).toEqual({});
    expect(override!.metadata).toEqual({ toStatus: "INTERVIEW" });
  });
});

describe("deletion", () => {
  it("removes all of a user's data when the user is deleted", async () => {
    const userId = await createUser();
    const application = await createApplication(userId);
    await testDb.db
      .insert(applicationEvents)
      .values(eventValues(userId, application.id));
    await testDb.db.insert(resumeVersions).values({ userId, name: "Backend" });

    await testDb.db.delete(users).where(eq(users.id, userId));

    const remaining = await Promise.all([
      testDb.db
        .select()
        .from(applications)
        .where(eq(applications.userId, userId)),
      testDb.db
        .select()
        .from(applicationEvents)
        .where(eq(applicationEvents.userId, userId)),
      testDb.db
        .select()
        .from(resumeVersions)
        .where(eq(resumeVersions.userId, userId)),
    ]);
    expect(remaining.flat()).toEqual([]);
  });

  it("removes an application's events and keeps its resume", async () => {
    const userId = await createUser();
    const [resume] = await testDb.db
      .insert(resumeVersions)
      .values({ userId, name: "General" })
      .returning();
    const application = await createApplication(userId, {
      resumeVersionId: resume!.id,
    });
    await testDb.db
      .insert(applicationEvents)
      .values(eventValues(userId, application.id));

    await testDb.db
      .delete(applications)
      .where(eq(applications.id, application.id));

    expect(
      await testDb.db
        .select()
        .from(applicationEvents)
        .where(eq(applicationEvents.applicationId, application.id)),
    ).toEqual([]);
    expect(
      await testDb.db
        .select()
        .from(resumeVersions)
        .where(eq(resumeVersions.id, resume!.id)),
    ).toHaveLength(1);
  });

  it("clears an application's resume when the resume is deleted", async () => {
    const userId = await createUser();
    const [resume] = await testDb.db
      .insert(resumeVersions)
      .values({ userId, name: "Old" })
      .returning();
    const application = await createApplication(userId, {
      resumeVersionId: resume!.id,
    });

    await testDb.db
      .delete(resumeVersions)
      .where(eq(resumeVersions.id, resume!.id));

    const [updated] = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.id, application.id));
    expect(updated!.resumeVersionId).toBeNull();
  });
});
