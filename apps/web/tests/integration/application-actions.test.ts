import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Database } from "@/server/db/types";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

// Actions run against PGlite as a signed-in test user.
const context = vi.hoisted(() => ({
  db: undefined as Database | undefined,
  userId: "",
}));
vi.mock("@/server/db/client", () => ({ getDb: () => context.db }));
vi.mock("@/server/auth/session", () => ({
  requireUser: async () => ({
    id: context.userId,
    email: "test@example.com",
    name: null,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  changeApplicationStatusAction,
  createApplicationAction,
  deleteApplicationAction,
  updateApplicationAction,
} = await import("@/app/(app)/applications/actions");
const { getApplication, listApplications } =
  await import("@/server/services/applications");

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
  context.db = testDb.db;
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  context.userId = await createTestUser(testDb.db);
});

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

const validForm = {
  companyName: "Figma",
  jobTitle: "Frontend Engineer",
  status: "ASSESSMENT",
  appliedAt: "2026-10-01T16:00:00.000Z",
  companyWebsite: "figma.com",
  jobUrl: "",
  location: "",
  employmentType: "none",
  salaryMin: "140k",
  salaryMax: "",
  salaryCurrency: "USD",
  source: "REFERRAL",
  sourcePlatform: "none",
  notes: "",
};

describe("createApplicationAction", () => {
  it("creates an application from the form", async () => {
    const result = await createApplicationAction(null, form(validForm));
    expect(result).toEqual({ ok: true, message: "Added Figma." });

    const [application] = await listApplications(context.userId, {}, testDb.db);
    expect(application).toMatchObject({
      companyName: "Figma",
      companyDomain: "figma.com",
      currentStatus: "ASSESSMENT",
      appliedAt: new Date("2026-10-01T16:00:00.000Z"),
      salaryMin: 140_000,
      salaryCurrency: "USD",
      source: "REFERRAL",
      employmentType: null,
      sourcePlatform: "OTHER",
    });
  });

  it("returns a message for each invalid field", async () => {
    const result = await createApplicationAction(
      null,
      form({
        ...validForm,
        companyName: " ",
        jobUrl: "figma",
        salaryMin: "lots",
      }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        companyName: "Enter the company.",
        jobUrl: "Enter a full link, starting with https://",
        salaryMin: "Enter an amount, like 120000 or 120k.",
      },
    });
    expect(await listApplications(context.userId, {}, testDb.db)).toEqual([]);
  });
});

describe("updateApplicationAction", () => {
  it("saves edits without changing the status", async () => {
    await createApplicationAction(null, form(validForm));
    const [created] = await listApplications(context.userId, {}, testDb.db);

    const result = await updateApplicationAction(
      created!.id,
      null,
      form({
        ...validForm,
        jobTitle: "Product Engineer",
        location: "Remote",
        status: "OFFER",
      }),
    );

    expect(result).toEqual({ ok: true, message: "Saved Figma." });
    const { application } = await getApplication(
      context.userId,
      created!.id,
      testDb.db,
    );
    expect(application).toMatchObject({
      jobTitle: "Product Engineer",
      location: "Remote",
      currentStatus: "ASSESSMENT",
    });
  });

  it("does not edit another user's application", async () => {
    await createApplicationAction(null, form(validForm));
    const [mine] = await listApplications(context.userId, {}, testDb.db);

    context.userId = await createTestUser(testDb.db);
    const result = await updateApplicationAction(
      mine!.id,
      null,
      form({ ...validForm, notes: "hijacked" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "This application no longer exists.",
    });
  });
});

describe("deleteApplicationAction", () => {
  it("deletes the application", async () => {
    await createApplicationAction(null, form(validForm));
    const [created] = await listApplications(context.userId, {}, testDb.db);

    expect(await deleteApplicationAction(created!.id)).toEqual({
      ok: true,
      message: "Application deleted.",
    });
    expect(await listApplications(context.userId, {}, testDb.db)).toEqual([]);
    expect(await deleteApplicationAction(created!.id)).toEqual({
      ok: false,
      error: "This application was already deleted.",
    });
  });
});

describe("changeApplicationStatusAction", () => {
  it("moves the application and reports where it went", async () => {
    await createApplicationAction(null, form(validForm));
    const [created] = await listApplications(context.userId, {}, testDb.db);

    expect(
      await changeApplicationStatusAction(created!.id, "INTERVIEW"),
    ).toEqual({ ok: true, message: "Moved to Interview." });
    expect(
      await changeApplicationStatusAction(created!.id, "INTERVIEW"),
    ).toEqual({ ok: true, message: "Already in Interview." });

    const { application, events } = await getApplication(
      context.userId,
      created!.id,
      testDb.db,
    );
    expect(application.currentStatus).toBe("INTERVIEW");
    expect(events.at(-1)).toMatchObject({
      eventType: "STATUS_OVERRIDDEN",
      sourceType: "MANUAL",
    });
  });

  it("does not move another user's application", async () => {
    await createApplicationAction(null, form(validForm));
    const [mine] = await listApplications(context.userId, {}, testDb.db);

    context.userId = await createTestUser(testDb.db);
    expect(await changeApplicationStatusAction(mine!.id, "REJECTED")).toEqual({
      ok: false,
      error: "This application no longer exists.",
    });
  });
});
