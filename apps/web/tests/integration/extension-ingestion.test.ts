import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applications, reviewItems } from "@/server/db/schema";
import {
  createApplication,
  getApplication,
} from "@/server/services/applications";
import { createContact } from "@/server/services/contacts";
import { NotFoundError } from "@/server/services/errors";
import { ingestExtensionSubmission } from "@/server/services/extension-ingestion";
import { listNotifications } from "@/server/services/notifications";
import {
  countOpenReviewItems,
  keepBoth,
  listOpenReviewItems,
  mergeDuplicate,
} from "@/server/services/review";
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

const submission = (fields: Record<string, unknown> = {}) => ({
  clientSubmissionId: crypto.randomUUID(),
  captureMode: "AUTO",
  platform: "GREENHOUSE",
  companyName: "Stripe",
  jobTitle: "Software Engineer",
  jobUrl: "https://boards.greenhouse.io/stripe/jobs/123456",
  atsJobId: "123456",
  location: "San Francisco, CA",
  submittedAt: daysAgo(0).toISOString(),
  ...fields,
});

const submit = (payload: Record<string, unknown>) =>
  ingestExtensionSubmission(userId, payload, testDb.db);

const listApplications = () =>
  testDb.db.select().from(applications).where(eq(applications.userId, userId));

describe("ingestExtensionSubmission", () => {
  it("creates an application from a new submission", async () => {
    const result = await submit(
      submission({ description: "<p>Build &amp; ship</p>" }),
    );
    expect(result.outcome).toBe("CREATED");

    const detail = await getApplication(
      userId,
      result.applicationId,
      testDb.db,
    );
    expect(detail.application).toMatchObject({
      companyName: "Stripe",
      sourcePlatform: "GREENHOUSE",
      atsJobId: "123456",
      jobDescription: "Build & ship",
      currentStatus: "APPLIED",
    });
    expect(detail.events).toEqual([
      expect.objectContaining({
        eventType: "APPLICATION_SUBMITTED",
        sourceType: "BROWSER_EXTENSION",
        sourceReference: "AUTO",
      }),
    ]);
  });

  it("answers a repeated submission the same way and records nothing new", async () => {
    const payload = submission();
    const first = await submit(payload);
    const again = await submit(payload);

    expect(again).toEqual(first);
    expect(await listApplications()).toHaveLength(1);
  });

  it("adds the submission to an application saved earlier", async () => {
    const saved = await createApplication(
      userId,
      {
        companyName: "Stripe, Inc.",
        jobTitle: "Software Engineer",
        status: "SAVED",
      },
      testDb.db,
    );

    const result = await submit(submission());
    expect(result).toEqual({
      applicationId: saved.id,
      outcome: "MATCHED_EXISTING",
    });
    const detail = await getApplication(userId, saved.id, testDb.db);
    expect(detail.application).toMatchObject({
      currentStatus: "APPLIED",
      // Details it was missing are filled in.
      jobUrl: "https://boards.greenhouse.io/stripe/jobs/123456",
      atsJobId: "123456",
      sourcePlatform: "GREENHOUSE",
    });
  });

  it("matches the same job posting even under another name", async () => {
    const first = await submit(submission());
    const result = await submit(
      submission({ companyName: "Stripe Payments", jobTitle: "SWE" }),
    );
    expect(result).toEqual({
      applicationId: first.applicationId,
      outcome: "MATCHED_EXISTING",
    });
  });

  it("creates a different role at the same company separately", async () => {
    await submit(submission());
    const result = await submit(
      submission({ jobTitle: "Product Designer", atsJobId: "999" }),
    );
    expect(result.outcome).toBe("CREATED");
    expect(await countOpenReviewItems(userId, testDb.db)).toBe(0);
  });

  it("asks about a possible duplicate", async () => {
    const existing = await createApplication(
      userId,
      {
        companyName: "Stripe",
        jobTitle: "Senior Software Engineer",
        appliedAt: daysAgo(4),
      },
      testDb.db,
    );

    const result = await submit(submission());
    expect(result.outcome).toBe("POSSIBLE_DUPLICATE");

    const [item] = await listOpenReviewItems(userId, testDb.db);
    expect(item).toMatchObject({
      kind: "POSSIBLE_DUPLICATE",
      application: { id: result.applicationId, jobTitle: "Software Engineer" },
      candidate: { id: existing.id, jobTitle: "Senior Software Engineer" },
      matchReasons: [
        "Same company",
        "Similar role",
        "Active in the last 30 days",
      ],
    });
    const [notification] = await listNotifications(userId, {}, testDb.db);
    expect(notification).toMatchObject({
      type: "REVIEW_NEEDED",
      title: "Is this Stripe application a duplicate?",
    });
  });

  it("rejects malformed submissions", async () => {
    await expect(
      submit(submission({ jobUrl: "javascript:alert(1)" })),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("resolving a possible duplicate", () => {
  async function duplicatePair() {
    const existing = await createApplication(
      userId,
      {
        companyName: "Stripe",
        jobTitle: "Senior Software Engineer",
        appliedAt: daysAgo(4),
        notes: "Referred by Sam",
      },
      testDb.db,
    );
    const { applicationId } = await submit(submission());
    const [item] = await listOpenReviewItems(userId, testDb.db);
    return { existing, duplicateId: applicationId, itemId: item!.id };
  }

  it("merges the duplicate into the existing application", async () => {
    const { existing, duplicateId, itemId } = await duplicatePair();
    await createContact(
      userId,
      duplicateId,
      { name: "Jordan", email: "jordan@stripe.com" },
      testDb.db,
    );

    const { applicationId } = await mergeDuplicate(userId, itemId, testDb.db);
    expect(applicationId).toBe(existing.id);

    const remaining = await listApplications();
    expect(remaining.map((row) => row.id)).toEqual([existing.id]);
    const merged = await getApplication(userId, existing.id, testDb.db);
    expect(merged.application).toMatchObject({
      notes: "Referred by Sam",
      atsJobId: "123456",
      sourcePlatform: "GREENHOUSE",
    });
    expect(merged.events.map((event) => event.sourceType)).toContain(
      "BROWSER_EXTENSION",
    );
    expect(merged.contacts.map((contact) => contact.name)).toEqual(["Jordan"]);
    expect(await countOpenReviewItems(userId, testDb.db)).toBe(0);
    const [notification] = await listNotifications(userId, {}, testDb.db);
    expect(notification!.readAt).not.toBeNull();

    // The resolved record stays, pointing at what remains.
    const [record] = await testDb.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, itemId));
    expect(record).toMatchObject({
      state: "RESOLVED",
      resolution: "MERGED",
      applicationId: existing.id,
    });
  });

  it("keeps both when they're different applications", async () => {
    const { itemId } = await duplicatePair();
    await keepBoth(userId, itemId, testDb.db);

    expect(await listApplications()).toHaveLength(2);
    expect(await countOpenReviewItems(userId, testDb.db)).toBe(0);
    await expect(
      mergeDuplicate(userId, itemId, testDb.db),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only lets the owner resolve it", async () => {
    const { itemId } = await duplicatePair();
    const intruder = await createTestUser(testDb.db);

    await expect(
      mergeDuplicate(intruder, itemId, testDb.db),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(keepBoth(intruder, itemId, testDb.db)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
