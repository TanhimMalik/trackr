import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { applicationEvents, resumeVersions } from "@/server/db/schema";
import {
  changeApplicationStatus,
  createApplication,
  deleteAllApplications,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
} from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";
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

const datadog = {
  companyName: "Datadog, Inc.",
  jobTitle: "Sr. Software Engineer II",
};

describe("createApplication", () => {
  it("records a submission and derives the applied status", async () => {
    const appliedAt = daysAgo(3);
    const application = await createApplication(
      userId,
      {
        ...datadog,
        jobUrl: "https://boards.greenhouse.io/datadog/jobs/4012345",
        appliedAt,
        source: "LINKEDIN",
      },
      testDb.db,
    );

    expect(application).toMatchObject({
      userId,
      companyName: "Datadog, Inc.",
      companyNameNorm: "datadog",
      jobTitleNorm: "senior software engineer 2",
      sourcePlatform: "GREENHOUSE",
      companyDomain: null,
      source: "LINKEDIN",
      currentStatus: "APPLIED",
      appliedAt,
    });

    const { events } = await getApplication(userId, application.id, testDb.db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "APPLICATION_SUBMITTED",
      sourceType: "MANUAL",
      eventTimestamp: appliedAt,
      statusBefore: "UNKNOWN",
      statusAfter: "APPLIED",
    });
    expect(events[0]!.dedupeKey).toMatch(/^manual:/);
  });

  it("detects a company career site and its domain", async () => {
    const application = await createApplication(
      userId,
      {
        companyName: "Stripe",
        jobTitle: "Software Engineer",
        jobUrl: "https://stripe.com/jobs/listing/123",
      },
      testDb.db,
    );
    expect(application).toMatchObject({
      sourcePlatform: "COMPANY_SITE",
      companyDomain: "stripe.com",
    });
  });

  it("uses the company website for the domain", async () => {
    const application = await createApplication(
      userId,
      {
        ...datadog,
        companyWebsite: "https://www.datadoghq.com/about",
        jobUrl: "https://boards.greenhouse.io/datadog/jobs/1",
      },
      testDb.db,
    );
    expect(application.companyDomain).toBe("datadoghq.com");

    await expect(
      createApplication(
        userId,
        { ...datadog, companyWebsite: "not a website" },
        testDb.db,
      ),
    ).rejects.toThrow(ZodError);
  });

  it("saves a job without applying", async () => {
    const application = await createApplication(
      userId,
      { ...datadog, status: "SAVED" },
      testDb.db,
    );
    expect(application.currentStatus).toBe("SAVED");
    expect(application.appliedAt).toBeNull();

    const { events } = await getApplication(userId, application.id, testDb.db);
    expect(events.map((e) => e.eventType)).toEqual(["JOB_SAVED"]);
  });

  it.each(["INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"] as const)(
    "starts an application at %s after recording the submission",
    async (status) => {
      const application = await createApplication(
        userId,
        { ...datadog, status },
        testDb.db,
      );
      expect(application.currentStatus).toBe(status);
      expect(application.appliedAt).not.toBeNull();

      const { events } = await getApplication(
        userId,
        application.id,
        testDb.db,
      );
      expect(
        events.map((e) => [e.eventType, e.statusBefore, e.statusAfter]),
      ).toEqual([
        ["APPLICATION_SUBMITTED", "UNKNOWN", "APPLIED"],
        ["STATUS_OVERRIDDEN", "APPLIED", status],
      ]);
    },
  );

  it("validates input", async () => {
    await expect(
      createApplication(
        userId,
        { companyName: "  ", jobTitle: "Engineer" },
        testDb.db,
      ),
    ).rejects.toThrow(ZodError);
    await expect(
      createApplication(
        userId,
        { ...datadog, salaryMin: 200_000, salaryMax: 150_000 },
        testDb.db,
      ),
    ).rejects.toThrow(ZodError);
    await expect(
      createApplication(
        userId,
        { ...datadog, jobUrl: "javascript:alert(1)" },
        testDb.db,
      ),
    ).rejects.toThrow(ZodError);
    await expect(
      createApplication(
        userId,
        { ...datadog, appliedAt: daysAgo(-3) },
        testDb.db,
      ),
    ).rejects.toThrow(ZodError);
    expect(await listApplications(userId, {}, testDb.db)).toEqual([]);
  });

  it("only accepts the user's own resumes", async () => {
    const otherUser = await createTestUser(testDb.db);
    const [othersResume] = await testDb.db
      .insert(resumeVersions)
      .values({ userId: otherUser, name: "Not yours" })
      .returning();

    await expect(
      createApplication(
        userId,
        { ...datadog, resumeVersionId: othersResume!.id },
        testDb.db,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("getApplication", () => {
  it("includes the resume that was submitted", async () => {
    const [resume] = await testDb.db
      .insert(resumeVersions)
      .values({ userId, name: "Backend — Fall 2026" })
      .returning();
    const created = await createApplication(
      userId,
      { ...datadog, resumeVersionId: resume!.id },
      testDb.db,
    );

    const detail = await getApplication(userId, created.id, testDb.db);
    expect(detail.resume).toEqual({
      id: resume!.id,
      name: "Backend — Fall 2026",
    });
  });

  it("has no resume when none was recorded", async () => {
    const created = await createApplication(userId, datadog, testDb.db);
    expect(
      (await getApplication(userId, created.id, testDb.db)).resume,
    ).toBeNull();
  });
});

describe("updateApplication", () => {
  it("updates details and their normalized forms without touching status", async () => {
    const created = await createApplication(
      userId,
      { ...datadog, status: "INTERVIEW" },
      testDb.db,
    );

    const updated = await updateApplication(
      userId,
      created.id,
      {
        companyName: "Figma",
        jobTitle: "Front-End Engineer",
        jobUrl: "https://www.figma.com/careers/job/1",
        location: "  New York, NY ",
        notes: "",
      },
      testDb.db,
    );

    expect(updated).toMatchObject({
      companyName: "Figma",
      companyNameNorm: "figma",
      jobTitleNorm: "frontend engineer",
      companyDomain: "figma.com",
      location: "New York, NY",
      notes: null,
      currentStatus: "INTERVIEW",
      appliedAt: created.appliedAt,
    });
  });

  it("keeps a known company domain when the link moves to a job board", async () => {
    const created = await createApplication(
      userId,
      { ...datadog, companyWebsite: "datadoghq.com" },
      testDb.db,
    );
    const moved = await updateApplication(
      userId,
      created.id,
      { jobUrl: "https://boards.greenhouse.io/datadog/jobs/9" },
      testDb.db,
    );
    expect(moved.companyDomain).toBe("datadoghq.com");

    const cleared = await updateApplication(
      userId,
      created.id,
      { companyWebsite: null },
      testDb.db,
    );
    expect(cleared.companyDomain).toBeNull();
  });

  it("checks the salary range against stored values", async () => {
    const created = await createApplication(
      userId,
      { ...datadog, salaryMin: 150_000 },
      testDb.db,
    );
    await expect(
      updateApplication(userId, created.id, { salaryMax: 100_000 }, testDb.db),
    ).rejects.toThrow(ZodError);
  });

  it("re-detects the platform when it is cleared", async () => {
    const created = await createApplication(
      userId,
      {
        ...datadog,
        jobUrl: "https://jobs.lever.co/datadog/123",
        sourcePlatform: "OTHER",
      },
      testDb.db,
    );
    const updated = await updateApplication(
      userId,
      created.id,
      { sourcePlatform: null },
      testDb.db,
    );
    expect(updated.sourcePlatform).toBe("LEVER");
  });
});

describe("changeApplicationStatus", () => {
  it("records the change as a manual event", async () => {
    const created = await createApplication(userId, datadog, testDb.db);

    const result = await changeApplicationStatus(
      userId,
      created.id,
      "ASSESSMENT",
      testDb.db,
    );

    expect(result).toMatchObject({
      previousStatus: "APPLIED",
      status: "ASSESSMENT",
      deduplicated: false,
      event: {
        eventType: "STATUS_OVERRIDDEN",
        sourceType: "MANUAL",
        metadata: { toStatus: "ASSESSMENT" },
        statusBefore: "APPLIED",
        statusAfter: "ASSESSMENT",
      },
    });
    const { application } = await getApplication(userId, created.id, testDb.db);
    expect(application.currentStatus).toBe("ASSESSMENT");
  });

  it("does nothing when the status is unchanged", async () => {
    const created = await createApplication(userId, datadog, testDb.db);
    expect(
      await changeApplicationStatus(userId, created.id, "APPLIED", testDb.db),
    ).toBeNull();
    const { events } = await getApplication(userId, created.id, testDb.db);
    expect(events).toHaveLength(1);
  });

  it("can move an application out of a final status", async () => {
    const created = await createApplication(
      userId,
      { ...datadog, status: "REJECTED" },
      testDb.db,
    );
    const result = await changeApplicationStatus(
      userId,
      created.id,
      "INTERVIEW",
      testDb.db,
    );
    expect(result?.status).toBe("INTERVIEW");
  });

  it("does not let people choose the system-only Unknown status", async () => {
    const created = await createApplication(userId, datadog, testDb.db);
    await expect(
      changeApplicationStatus(userId, created.id, "UNKNOWN", testDb.db),
    ).rejects.toThrow(ZodError);
  });
});

describe("deleteApplication", () => {
  it("removes the application and its history", async () => {
    const created = await createApplication(
      userId,
      { ...datadog, status: "OFFER" },
      testDb.db,
    );
    await deleteApplication(userId, created.id, testDb.db);

    await expect(getApplication(userId, created.id, testDb.db)).rejects.toThrow(
      NotFoundError,
    );
    expect(
      await testDb.db
        .select()
        .from(applicationEvents)
        .where(eq(applicationEvents.applicationId, created.id)),
    ).toEqual([]);
  });
});

describe("deleteAllApplications", () => {
  it("deletes only the user's own applications", async () => {
    const otherUser = await createTestUser(testDb.db);
    await createApplication(userId, datadog, testDb.db);
    await createApplication(userId, { ...datadog, status: "OFFER" }, testDb.db);
    await createApplication(otherUser, datadog, testDb.db);

    expect(await deleteAllApplications(userId, testDb.db)).toBe(2);
    expect(await listApplications(userId, {}, testDb.db)).toEqual([]);
    expect(await listApplications(otherUser, {}, testDb.db)).toHaveLength(1);
  });
});

describe("listApplications", () => {
  it("lists the most recently active first", async () => {
    const older = await createApplication(
      userId,
      { companyName: "Older", jobTitle: "Engineer", appliedAt: daysAgo(10) },
      testDb.db,
    );
    const newer = await createApplication(
      userId,
      { companyName: "Newer", jobTitle: "Engineer", appliedAt: daysAgo(1) },
      testDb.db,
    );
    expect(
      (await listApplications(userId, {}, testDb.db)).map((a) => a.id),
    ).toEqual([newer.id, older.id]);
  });
});

describe("malformed ids", () => {
  it("treats an id that is not a UUID as not found", async () => {
    await expect(getApplication(userId, "abc", testDb.db)).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      changeApplicationStatus(userId, "1 or 1=1", "OFFER", testDb.db),
    ).rejects.toThrow(NotFoundError);
    await expect(
      deleteApplication(userId, "../../etc", testDb.db),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("isolation between users", () => {
  it("never exposes or changes another user's applications", async () => {
    const intruder = await createTestUser(testDb.db);
    const mine = await createApplication(userId, datadog, testDb.db);

    expect(await listApplications(intruder, {}, testDb.db)).toEqual([]);
    await expect(getApplication(intruder, mine.id, testDb.db)).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      updateApplication(intruder, mine.id, { notes: "hi" }, testDb.db),
    ).rejects.toThrow(NotFoundError);
    await expect(
      changeApplicationStatus(intruder, mine.id, "REJECTED", testDb.db),
    ).rejects.toThrow(NotFoundError);
    await expect(
      deleteApplication(intruder, mine.id, testDb.db),
    ).rejects.toThrow(NotFoundError);

    const { application } = await getApplication(userId, mine.id, testDb.db);
    expect(application).toMatchObject({
      currentStatus: "APPLIED",
      notes: null,
    });
  });
});
