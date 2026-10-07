import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  createApplication,
  getApplication,
  logActivity,
} from "@/server/services/applications";
import {
  createContact,
  deleteContact,
  updateContact,
} from "@/server/services/contacts";
import { DuplicateContactError, NotFoundError } from "@/server/services/errors";
import { restoreEvent, revertEvent } from "@/server/services/events";
import {
  createInterview,
  deleteInterview,
  listInterviews,
  setInterviewStatus,
  updateInterview,
} from "@/server/services/interviews";
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
    { companyName: "Ramp", jobTitle: "Engineer", appliedAt: daysAgo(10) },
    testDb.db,
  );
  applicationId = application.id;
});

const detail = () => getApplication(userId, applicationId, testDb.db);
const inDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("contacts", () => {
  it("adds, edits and removes a contact", async () => {
    const contact = await createContact(
      userId,
      applicationId,
      {
        name: "  Jordan Lee ",
        email: "Jordan.Lee@Ramp.com",
        title: "Technical Recruiter",
        contactType: "RECRUITER",
      },
      testDb.db,
    );
    expect(contact).toMatchObject({
      name: "Jordan Lee",
      email: "jordan.lee@ramp.com",
      contactType: "RECRUITER",
    });

    await updateContact(
      userId,
      contact.id,
      { name: "Jordan Lee", title: "Recruiting Lead", email: "" },
      testDb.db,
    );
    expect((await detail()).contacts[0]).toMatchObject({
      title: "Recruiting Lead",
      email: null,
      contactType: "OTHER",
    });

    await deleteContact(userId, contact.id, testDb.db);
    expect((await detail()).contacts).toEqual([]);
  });

  it("rejects a second contact with the same email", async () => {
    const input = { name: "Sam", email: "sam@ramp.com" };
    await createContact(userId, applicationId, input, testDb.db);
    await expect(
      createContact(userId, applicationId, input, testDb.db),
    ).rejects.toBeInstanceOf(DuplicateContactError);
  });

  it("validates the input", async () => {
    await expect(
      createContact(
        userId,
        applicationId,
        { name: "", email: "nope" },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("keeps contacts private to their owner", async () => {
    const contact = await createContact(
      userId,
      applicationId,
      { name: "Sam" },
      testDb.db,
    );
    const intruder = await createTestUser(testDb.db);

    await expect(
      createContact(intruder, applicationId, { name: "X" }, testDb.db),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateContact(intruder, contact.id, { name: "X" }, testDb.db),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      deleteContact(intruder, contact.id, testDb.db),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("interviews", () => {
  it("adds, edits, completes and removes an interview", async () => {
    const contact = await createContact(
      userId,
      applicationId,
      { name: "Priya" },
      testDb.db,
    );
    const interview = await createInterview(
      userId,
      applicationId,
      {
        interviewType: "TECHNICAL",
        scheduledAt: inDays(3).toISOString(),
        durationMinutes: 45,
        meetingUrl: "https://meet.example.com/abc",
        contactId: contact.id,
      },
      testDb.db,
    );
    expect(interview).toMatchObject({
      interviewType: "TECHNICAL",
      durationMinutes: 45,
      status: "SCHEDULED",
      contactId: contact.id,
    });

    await updateInterview(
      userId,
      interview.id,
      { interviewType: "ONSITE", location: "New York" },
      testDb.db,
    );
    await setInterviewStatus(userId, interview.id, "COMPLETED", testDb.db);
    expect((await detail()).interviews[0]).toMatchObject({
      interviewType: "ONSITE",
      location: "New York",
      scheduledAt: null,
      status: "COMPLETED",
    });

    await deleteInterview(userId, interview.id, testDb.db);
    expect((await detail()).interviews).toEqual([]);
  });

  it("lists dated interviews in order and undated ones last", async () => {
    await createInterview(userId, applicationId, {}, testDb.db);
    await createInterview(
      userId,
      applicationId,
      { scheduledAt: inDays(5).toISOString(), interviewType: "ONSITE" },
      testDb.db,
    );
    await createInterview(
      userId,
      applicationId,
      { scheduledAt: inDays(1).toISOString(), interviewType: "TECHNICAL" },
      testDb.db,
    );

    const list = await listInterviews(userId, applicationId, testDb.db);
    expect(list.map((interview) => interview.interviewType)).toEqual([
      "TECHNICAL",
      "ONSITE",
      "OTHER",
    ]);
  });

  it("only links contacts from the same application", async () => {
    const other = await createApplication(
      userId,
      { companyName: "Figma", jobTitle: "Engineer" },
      testDb.db,
    );
    const stranger = await createContact(
      userId,
      other.id,
      { name: "Alex" },
      testDb.db,
    );

    await expect(
      createInterview(
        userId,
        applicationId,
        { contactId: stranger.id },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects durations outside a day", async () => {
    await expect(
      createInterview(userId, applicationId, { durationMinutes: 0 }, testDb.db),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("logActivity", () => {
  it("records an event that updates the status", async () => {
    const result = await logActivity(
      userId,
      applicationId,
      { type: "ASSESSMENT_RECEIVED", occurredAt: daysAgo(2).toISOString() },
      testDb.db,
    );

    expect(result.status).toBe("ASSESSMENT");
    expect(result.event).toMatchObject({
      eventType: "ASSESSMENT_RECEIVED",
      sourceType: "MANUAL",
    });
  });

  it("creates the interview a scheduled interview describes", async () => {
    const scheduledAt = inDays(4);
    const { event, status } = await logActivity(
      userId,
      applicationId,
      {
        type: "INTERVIEW_SCHEDULED",
        occurredAt: new Date().toISOString(),
        interviewKind: "TECHNICAL",
        scheduledAt: scheduledAt.toISOString(),
      },
      testDb.db,
    );

    expect(status).toBe("INTERVIEW");
    expect((await detail()).interviews).toEqual([
      expect.objectContaining({
        interviewType: "TECHNICAL",
        scheduledAt,
        sourceEventId: event.id,
      }),
    ]);
  });

  it("removes and brings back that interview with undo and restore", async () => {
    const { event } = await logActivity(
      userId,
      applicationId,
      {
        type: "INTERVIEW_SCHEDULED",
        occurredAt: new Date().toISOString(),
        scheduledAt: inDays(2).toISOString(),
      },
      testDb.db,
    );

    await revertEvent(userId, event.id, testDb.db);
    expect((await detail()).interviews).toEqual([]);

    await restoreEvent(userId, event.id, testDb.db);
    expect((await detail()).interviews).toHaveLength(1);
  });

  it("moves the scheduled interview when it is rescheduled", async () => {
    await logActivity(
      userId,
      applicationId,
      {
        type: "INTERVIEW_SCHEDULED",
        occurredAt: daysAgo(1).toISOString(),
        scheduledAt: inDays(2).toISOString(),
      },
      testDb.db,
    );
    const [scheduled] = (await detail()).interviews;
    const later = inDays(6);

    const { event } = await createReschedule(later);

    const [moved] = (await detail()).interviews;
    expect(moved).toMatchObject({ id: scheduled!.id, scheduledAt: later });
    expect(event.eventType).toBe("INTERVIEW_RESCHEDULED");
  });

  it("requires a time for a scheduled interview and a past date", async () => {
    await expect(
      logActivity(
        userId,
        applicationId,
        { type: "INTERVIEW_SCHEDULED", occurredAt: new Date().toISOString() },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      logActivity(
        userId,
        applicationId,
        { type: "FOLLOW_UP_SENT", occurredAt: inDays(3).toISOString() },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("doesn't accept system-only event types", async () => {
    await expect(
      logActivity(
        userId,
        applicationId,
        { type: "STATUS_OVERRIDDEN", occurredAt: new Date().toISOString() },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

// Rescheduling arrives from email in later phases; record one directly.
async function createReschedule(scheduledAt: Date) {
  const { processApplicationEvent } = await import("@/server/services/events");
  return processApplicationEvent(
    {
      userId,
      applicationId,
      type: "INTERVIEW_RESCHEDULED",
      occurredAt: new Date(),
      sourceType: "EMAIL",
      metadata: { scheduledAt: scheduledAt.toISOString() },
      dedupeKey: `email:${crypto.randomUUID()}`,
    },
    testDb.db,
  );
}
