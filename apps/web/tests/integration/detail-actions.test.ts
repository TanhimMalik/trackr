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
    isDemo: false,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  createContactAction,
  createInterviewAction,
  deleteContactAction,
  logActivityAction,
  setInterviewStatusAction,
} = await import("@/app/(app)/applications/detail-actions");
const { createApplication } = await import("@/server/services/applications");

let testDb: TestDatabase;
let applicationId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  context.db = testDb.db;
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  context.userId = await createTestUser(testDb.db);
  applicationId = (
    await createApplication(
      context.userId,
      { companyName: "Ramp", jobTitle: "Engineer" },
      testDb.db,
    )
  ).id;
});

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

describe("logActivityAction", () => {
  it("logs the activity and returns its event for undo", async () => {
    expect(
      await logActivityAction(
        applicationId,
        null,
        form({
          type: "FOLLOW_UP_SENT",
          occurredAt: new Date().toISOString(),
        }),
      ),
    ).toEqual({
      ok: true,
      message: 'Logged "Sent a follow-up".',
      eventId: expect.any(String),
    });
  });

  it("explains what's missing", async () => {
    expect(
      await logActivityAction(
        applicationId,
        null,
        form({
          type: "INTERVIEW_SCHEDULED",
          occurredAt: new Date().toISOString(),
        }),
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { scheduledAt: "Pick the interview's date and time." },
    });
  });
});

describe("contact actions", () => {
  it("adds a contact and reports a duplicate email on the field", async () => {
    const fields = form({
      name: "Jordan Lee",
      email: "jordan@example.com",
      contactType: "RECRUITER",
    });
    expect(await createContactAction(applicationId, null, fields)).toEqual({
      ok: true,
      message: "Added Jordan Lee.",
    });
    expect(await createContactAction(applicationId, null, fields)).toEqual({
      ok: false,
      fieldErrors: { email: "This person is already a contact." },
    });
  });

  it("reports a contact that no longer exists", async () => {
    expect(await deleteContactAction(crypto.randomUUID())).toEqual({
      ok: false,
      error: "This contact no longer exists.",
    });
  });
});

describe("interview actions", () => {
  it("adds an interview and changes its status", async () => {
    expect(
      await createInterviewAction(
        applicationId,
        null,
        form({ interviewType: "TECHNICAL", durationMinutes: "45" }),
      ),
    ).toEqual({ ok: true, message: "Added the technical interview." });

    const { listInterviews } = await import("@/server/services/interviews");
    const [interview] = await listInterviews(
      context.userId,
      applicationId,
      testDb.db,
    );
    expect(await setInterviewStatusAction(interview!.id, "COMPLETED")).toEqual({
      ok: true,
      message: "Marked as completed.",
    });
  });

  it("reports an unreadable length", async () => {
    expect(
      await createInterviewAction(
        applicationId,
        null,
        form({ durationMinutes: "an hour" }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { durationMinutes: expect.any(String) },
    });
  });
});
