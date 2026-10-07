import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applicationEvents } from "@/server/db/schema";
import {
  createApplication,
  listBoardApplications,
} from "@/server/services/applications";
import {
  processApplicationEvent,
  recomputeApplicationState,
} from "@/server/services/events";
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

const email = async (
  applicationId: string,
  type: Parameters<typeof processApplicationEvent>[0]["type"],
  days: number,
  metadata?: Record<string, unknown>,
) =>
  processApplicationEvent(
    {
      userId,
      applicationId,
      type,
      occurredAt: daysAgo(days),
      sourceType: "EMAIL",
      metadata,
      dedupeKey: `email:${crypto.randomUUID()}`,
    },
    testDb.db,
  );

const signalFor = async (applicationId: string) =>
  (await listBoardApplications(userId, {}, testDb.db)).find(
    (application) => application.id === applicationId,
  )!.signal;

describe("listBoardApplications", () => {
  it("summarizes a card with its latest informative event", async () => {
    const app = await createApplication(
      userId,
      { companyName: "Ramp", jobTitle: "Engineer", appliedAt: daysAgo(20) },
      testDb.db,
    );
    await email(app.id, "ASSESSMENT_RECEIVED", 12);
    await email(app.id, "INTERVIEW_SCHEDULED", 4);

    expect(await signalFor(app.id)).toEqual({
      kind: "event",
      eventType: "INTERVIEW_SCHEDULED",
      label: "Interview scheduled",
    });
  });

  it("labels a final round", async () => {
    const app = await createApplication(
      userId,
      { companyName: "Duolingo", jobTitle: "Engineer", appliedAt: daysAgo(20) },
      testDb.db,
    );
    await email(app.id, "NEXT_ROUND", 3, { isFinalRound: true });
    expect((await signalFor(app.id))?.label).toBe("Final round");
  });

  it("ignores undone events", async () => {
    const app = await createApplication(
      userId,
      { companyName: "Figma", jobTitle: "Engineer", appliedAt: daysAgo(20) },
      testDb.db,
    );
    await email(app.id, "ASSESSMENT_RECEIVED", 10);
    const { event } = await email(app.id, "REJECTION_RECEIVED", 2);
    await testDb.db
      .update(applicationEvents)
      .set({ revertedAt: new Date() })
      .where(eq(applicationEvents.id, event.id));
    await testDb.db.transaction((tx) =>
      recomputeApplicationState(tx, userId, app.id),
    );

    expect((await signalFor(app.id))?.label).toBe("Assessment received");
  });

  it("shows how an application was captured when nothing else happened", async () => {
    // Created by hand, then confirmed by email: the origin is the manual entry.
    const manual = await createApplication(
      userId,
      {
        companyName: "Plaid",
        jobTitle: "Engineer",
        appliedAt: daysAgo(9),
        source: "REFERRAL",
      },
      testDb.db,
    );
    await email(manual.id, "APPLICATION_CONFIRMATION_RECEIVED", 9);

    expect(await signalFor(manual.id)).toEqual({
      kind: "source",
      source: "REFERRAL",
      label: "Referral",
    });
  });

  it("returns no summary when there is nothing useful to say", async () => {
    const app = await createApplication(
      userId,
      { companyName: "Linear", jobTitle: "Engineer" },
      testDb.db,
    );
    expect(await signalFor(app.id)).toBeNull();
  });

  it("applies the same filters as the list", async () => {
    await createApplication(
      userId,
      { companyName: "Saved Co", jobTitle: "Engineer", status: "SAVED" },
      testDb.db,
    );
    await createApplication(
      userId,
      { companyName: "Applied Co", jobTitle: "Engineer" },
      testDb.db,
    );

    const board = await listBoardApplications(
      userId,
      { statuses: ["SAVED"] },
      testDb.db,
    );
    expect(board.map((application) => application.companyName)).toEqual([
      "Saved Co",
    ]);
  });
});
