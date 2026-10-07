import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  createApplication,
  getApplication,
} from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";
import {
  processApplicationEvent,
  type ApplicationEventInput,
} from "@/server/services/events";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
let applicationId: string;
let appliedAt: Date;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
  appliedAt = daysAgo(20);
  const application = await createApplication(
    userId,
    { companyName: "Datadog", jobTitle: "Software Engineer", appliedAt },
    testDb.db,
  );
  applicationId = application.id;
});

const emailEvent = (
  type: ApplicationEventInput["type"],
  occurredAt: Date,
  messageId: string,
  extra: Partial<ApplicationEventInput> = {},
): ApplicationEventInput => ({
  userId,
  applicationId,
  type,
  occurredAt,
  sourceType: "EMAIL",
  sourceReference: messageId,
  classificationMethod: "RULES",
  confidence: 0.97,
  dedupeKey: `email:${messageId}`,
  ...extra,
});

const statusOf = async () =>
  (await getApplication(userId, applicationId, testDb.db)).application;

describe("processApplicationEvent", () => {
  it("moves the application forward and records the transition", async () => {
    const result = await processApplicationEvent(
      emailEvent("INTERVIEW_REQUESTED", daysAgo(5), "msg-interview"),
      testDb.db,
    );

    expect(result).toMatchObject({
      deduplicated: false,
      previousStatus: "APPLIED",
      status: "INTERVIEW",
      event: {
        eventType: "INTERVIEW_REQUESTED",
        sourceType: "EMAIL",
        classificationMethod: "RULES",
        confidence: expect.closeTo(0.97, 5),
        statusBefore: "APPLIED",
        statusAfter: "INTERVIEW",
      },
    });
    const application = await statusOf();
    expect(application.currentStatus).toBe("INTERVIEW");
    expect(application.lastActivityAt).toEqual(result.event.eventTimestamp);
  });

  it("records a repeated event only once", async () => {
    const event = emailEvent("ASSESSMENT_RECEIVED", daysAgo(8), "msg-1");
    const first = await processApplicationEvent(event, testDb.db);
    const second = await processApplicationEvent(event, testDb.db);

    expect(first.deduplicated).toBe(false);
    expect(second).toMatchObject({
      deduplicated: true,
      previousStatus: "ASSESSMENT",
      status: "ASSESSMENT",
    });
    expect(second.event.id).toBe(first.event.id);
    const { events } = await getApplication(userId, applicationId, testDb.db);
    expect(events).toHaveLength(2);
  });

  it("does not regress when an older email is processed late", async () => {
    await processApplicationEvent(
      emailEvent("INTERVIEW_REQUESTED", daysAgo(5), "msg-interview"),
      testDb.db,
    );
    const late = await processApplicationEvent(
      emailEvent(
        "APPLICATION_CONFIRMATION_RECEIVED",
        daysAgo(19),
        "msg-confirmation",
      ),
      testDb.db,
    );

    expect(late.status).toBe("INTERVIEW");
    // The late event takes its true place in the history.
    expect(late.event).toMatchObject({
      statusBefore: "APPLIED",
      statusAfter: "APPLIED",
    });
    const { events } = await getApplication(userId, applicationId, testDb.db);
    expect(events.map((e) => [e.eventType, e.statusAfter])).toEqual([
      ["APPLICATION_SUBMITTED", "APPLIED"],
      ["APPLICATION_CONFIRMATION_RECEIVED", "APPLIED"],
      ["INTERVIEW_REQUESTED", "INTERVIEW"],
    ]);
  });

  it("rewrites stored transitions when an earlier event changes the history", async () => {
    const interview = await processApplicationEvent(
      emailEvent("INTERVIEW_REQUESTED", daysAgo(5), "msg-interview"),
      testDb.db,
    );
    expect(interview.event.statusBefore).toBe("APPLIED");

    // An assessment that happened before the interview arrives afterwards.
    await processApplicationEvent(
      emailEvent("ASSESSMENT_RECEIVED", daysAgo(10), "msg-assessment"),
      testDb.db,
    );

    const { events } = await getApplication(userId, applicationId, testDb.db);
    expect(
      events.map((e) => [e.eventType, e.statusBefore, e.statusAfter]),
    ).toEqual([
      ["APPLICATION_SUBMITTED", "UNKNOWN", "APPLIED"],
      ["ASSESSMENT_RECEIVED", "APPLIED", "ASSESSMENT"],
      ["INTERVIEW_REQUESTED", "ASSESSMENT", "INTERVIEW"],
    ]);
  });

  it("keeps a rejection when automation reports later activity", async () => {
    await processApplicationEvent(
      emailEvent("REJECTION_RECEIVED", daysAgo(3), "msg-rejection"),
      testDb.db,
    );
    const result = await processApplicationEvent(
      emailEvent("INTERVIEW_REQUESTED", daysAgo(1), "msg-stray"),
      testDb.db,
    );
    expect(result.status).toBe("REJECTED");
    expect((await statusOf()).currentStatus).toBe("REJECTED");
  });

  it("validates event metadata before writing anything", async () => {
    await expect(
      processApplicationEvent(
        {
          userId,
          applicationId,
          type: "STATUS_OVERRIDDEN",
          occurredAt: new Date(),
          sourceType: "MANUAL",
          metadata: {},
          dedupeKey: "manual:bad",
        },
        testDb.db,
      ),
    ).rejects.toThrow(ZodError);
    await expect(
      processApplicationEvent(
        emailEvent("OFFER_RECEIVED", daysAgo(1), "msg-x", { confidence: 1.4 }),
        testDb.db,
      ),
    ).rejects.toThrow(ZodError);

    const { events } = await getApplication(userId, applicationId, testDb.db);
    expect(events).toHaveLength(1);
  });

  it("refuses events for applications the user does not own", async () => {
    const intruder = await createTestUser(testDb.db);
    await expect(
      processApplicationEvent(
        {
          ...emailEvent("REJECTION_RECEIVED", daysAgo(1), "msg-evil"),
          userId: intruder,
        },
        testDb.db,
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(
      processApplicationEvent(
        {
          ...emailEvent("REJECTION_RECEIVED", daysAgo(1), "msg-missing"),
          applicationId: crypto.randomUUID(),
        },
        testDb.db,
      ),
    ).rejects.toThrow(NotFoundError);
    expect((await statusOf()).currentStatus).toBe("APPLIED");
  });

  it("applies concurrent events consistently", async () => {
    await Promise.all([
      processApplicationEvent(
        emailEvent("ASSESSMENT_RECEIVED", daysAgo(12), "msg-a"),
        testDb.db,
      ),
      processApplicationEvent(
        emailEvent("INTERVIEW_REQUESTED", daysAgo(6), "msg-b"),
        testDb.db,
      ),
      processApplicationEvent(
        emailEvent("NEXT_ROUND", daysAgo(2), "msg-c", {
          metadata: { isFinalRound: true },
        }),
        testDb.db,
      ),
    ]);

    const { application, events } = await getApplication(
      userId,
      applicationId,
      testDb.db,
    );
    expect(application.currentStatus).toBe("FINAL_ROUND");
    expect(events.map((e) => e.statusAfter)).toEqual([
      "APPLIED",
      "ASSESSMENT",
      "INTERVIEW",
      "FINAL_ROUND",
    ]);
  });
});
