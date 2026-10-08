import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_CAPTURES } from "@/server/demo/captures";
import { getApplication } from "@/server/services/applications";
import { seedDemoWorkspace } from "@/server/services/demo-workspace";
import { ingestExtensionSubmission } from "@/server/services/extension-ingestion";
import {
  getAutoTrackSupportedSites,
  setAutoTrackSupportedSites,
} from "@/server/services/settings";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

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
  await seedDemoWorkspace(userId, {}, testDb.db);
});

function simulate(id: (typeof DEMO_CAPTURES)[number]["id"]) {
  const capture = DEMO_CAPTURES.find((item) => item.id === id)!;
  return ingestExtensionSubmission(
    userId,
    {
      clientSubmissionId: crypto.randomUUID(),
      captureMode: capture.captureMode,
      platform: capture.platform,
      companyName: capture.companyName,
      jobTitle: capture.jobTitle,
      jobUrl: capture.jobUrl,
      location: capture.location,
      submittedAt: new Date().toISOString(),
    },
    testDb.db,
  );
}

describe("demo captures", () => {
  it("creates a new application for a company the demo doesn't have", async () => {
    const { outcome, applicationId } = await simulate("new-job");
    expect(outcome).toBe("CREATED");
    const { application } = await getApplication(
      userId,
      applicationId,
      testDb.db,
    );
    expect(application).toMatchObject({
      companyName: "Retool",
      companyDomain: "retool.com",
      currentStatus: "APPLIED",
    });
  });

  it("moves the saved Snowflake job to Applied", async () => {
    const { outcome, applicationId } = await simulate("saved-job");
    expect(outcome).toBe("MATCHED_EXISTING");
    const { application } = await getApplication(
      userId,
      applicationId,
      testDb.db,
    );
    expect(application).toMatchObject({
      companyName: "Snowflake",
      currentStatus: "APPLIED",
    });
  });

  it("asks whether the Stripe role duplicates the New Grad application", async () => {
    expect((await simulate("similar-role")).outcome).toBe("POSSIBLE_DUPLICATE");
  });
});

describe("auto-track setting", () => {
  it("is on by default and can be turned off", async () => {
    expect(await getAutoTrackSupportedSites(userId, testDb.db)).toBe(true);
    await setAutoTrackSupportedSites(userId, false, testDb.db);
    expect(await getAutoTrackSupportedSites(userId, testDb.db)).toBe(false);
  });
});
