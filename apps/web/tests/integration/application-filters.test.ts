import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changeApplicationStatus,
  countApplications,
  createApplication,
  listApplications,
} from "@/server/services/applications";
import { loadApplicationProgress } from "@/server/services/analytics";
import { processApplicationEvent } from "@/server/services/events";
import type { ApplicationFilters } from "@/lib/applications/filters";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date();

beforeAll(async () => {
  testDb = await createTestDatabase();
  userId = await createTestUser(testDb.db);

  const add = (input: Parameters<typeof createApplication>[1]) =>
    createApplication(userId, input, testDb.db);

  // Responded by email.
  const datadog = await add({
    companyName: "Datadog",
    jobTitle: "Software Engineer",
    location: "New York, NY",
    source: "LINKEDIN",
    appliedAt: daysAgo(20, now),
  });
  await processApplicationEvent(
    {
      userId,
      applicationId: datadog.id,
      type: "ASSESSMENT_RECEIVED",
      occurredAt: daysAgo(15, now),
      sourceType: "EMAIL",
      dedupeKey: "email:dd-assessment",
    },
    testDb.db,
  );

  // Responded through a manual move to Interview.
  const stripe = await add({
    companyName: "Stripe",
    jobTitle: "Backend Engineer",
    location: "Remote",
    source: "REFERRAL",
    appliedAt: daysAgo(3, now),
  });
  await changeApplicationStatus(userId, stripe.id, "INTERVIEW", testDb.db);

  // Waiting.
  await add({
    companyName: "Acme 100% Co",
    jobTitle: "Frontend Engineer",
    location: "Austin, TX",
    source: "LINKEDIN",
    appliedAt: daysAgo(45, now),
  });
  await add({ companyName: "Notion", jobTitle: "Designer", status: "SAVED" });

  // Another user's matching application must never appear.
  await createApplication(
    await createTestUser(testDb.db),
    { companyName: "Datadog", jobTitle: "Software Engineer" },
    testDb.db,
  );
});

afterAll(async () => {
  await testDb.close();
});

const companies = async (filters: Partial<ApplicationFilters>) =>
  (await listApplications(userId, filters, testDb.db, now)).map(
    (application) => application.companyName,
  );

describe("listApplications filters", () => {
  it("searches company, role and location without case sensitivity", async () => {
    expect(await companies({ query: "data" })).toEqual(["Datadog"]);
    expect(await companies({ query: "BACKEND" })).toEqual(["Stripe"]);
    expect(await companies({ query: "austin" })).toEqual(["Acme 100% Co"]);
  });

  it("treats wildcard characters in a search literally", async () => {
    expect(await companies({ query: "100%" })).toEqual(["Acme 100% Co"]);
    expect(await companies({ query: "%" })).toEqual(["Acme 100% Co"]);
    expect(await companies({ query: "_" })).toEqual([]);
  });

  it("filters by status and source", async () => {
    expect(await companies({ statuses: ["INTERVIEW", "SAVED"] })).toEqual(
      expect.arrayContaining(["Stripe", "Notion"]),
    );
    expect(await companies({ statuses: ["INTERVIEW", "SAVED"] })).toHaveLength(
      2,
    );
    expect((await companies({ sources: ["LINKEDIN"] })).sort()).toEqual([
      "Acme 100% Co",
      "Datadog",
    ]);
  });

  it("filters by how recently the application was submitted", async () => {
    expect(await companies({ appliedWithin: "7" })).toEqual(["Stripe"]);
    expect((await companies({ appliedWithin: "30" })).sort()).toEqual([
      "Datadog",
      "Stripe",
    ]);
  });

  it("filters by whether the company responded", async () => {
    expect((await companies({ response: "responded" })).sort()).toEqual([
      "Datadog",
      "Stripe",
    ]);
    expect((await companies({ response: "waiting" })).sort()).toEqual([
      "Acme 100% Co",
      "Notion",
    ]);
  });

  it("combines filters", async () => {
    expect(
      await companies({ sources: ["LINKEDIN"], response: "waiting" }),
    ).toEqual(["Acme 100% Co"]);
  });
});

describe("the responded filter and taken-back manual moves", () => {
  it("matches the analytics definition of a response", async () => {
    const owner = await createTestUser(testDb.db);
    const add = (companyName: string) =>
      createApplication(
        owner,
        { companyName, jobTitle: "Engineer", appliedAt: daysAgo(10, now) },
        testDb.db,
      );
    const move = (
      id: string,
      status: Parameters<typeof changeApplicationStatus>[2],
    ) => changeApplicationStatus(owner, id, status, testDb.db);

    // Dragged to Assessment by mistake and straight back.
    const coinbase = await add("Coinbase");
    await move(coinbase.id, "ASSESSMENT");
    await move(coinbase.id, "APPLIED");

    // Closed by mistake, then reopened.
    const ramp = await add("Ramp");
    await move(ramp.id, "REJECTED");
    await move(ramp.id, "APPLIED");

    // Moved back from Interview, but Assessment is still a response.
    const figma = await add("Figma");
    await move(figma.id, "INTERVIEW");
    await move(figma.id, "ASSESSMENT");

    // The company responded by email; moving the card back doesn't undo that.
    const vercel = await add("Vercel");
    await processApplicationEvent(
      {
        userId: owner,
        applicationId: vercel.id,
        type: "ASSESSMENT_RECEIVED",
        occurredAt: daysAgo(5, now),
        sourceType: "EMAIL",
        dedupeKey: "email:vercel-assessment",
      },
      testDb.db,
    );
    await move(vercel.id, "APPLIED");

    const responded = (
      await listApplications(owner, { response: "responded" }, testDb.db, now)
    ).map((application) => application.companyName);
    expect(responded.sort()).toEqual(["Figma", "Vercel"]);

    const progress = await loadApplicationProgress(owner, testDb.db);
    expect(progress.filter((p) => p.firstResponseAt !== null)).toHaveLength(2);
  });
});

describe("listApplications sorting", () => {
  it("sorts by applied date with saved jobs last", async () => {
    expect(await companies({ sort: "newest" })).toEqual([
      "Stripe",
      "Datadog",
      "Acme 100% Co",
      "Notion",
    ]);
    expect(await companies({ sort: "oldest" })).toEqual([
      "Acme 100% Co",
      "Datadog",
      "Stripe",
      "Notion",
    ]);
  });

  it("sorts by company name", async () => {
    expect(await companies({ sort: "company" })).toEqual([
      "Acme 100% Co",
      "Datadog",
      "Notion",
      "Stripe",
    ]);
  });

  it("sorts by pipeline stage, most advanced first", async () => {
    expect(await companies({ sort: "status" })).toEqual([
      "Stripe",
      "Datadog",
      "Acme 100% Co",
      "Notion",
    ]);
  });

  it("sorts by recent activity by default", async () => {
    const rows = await listApplications(userId, {}, testDb.db, now);
    const times = rows.map((row) => row.lastActivityAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // Notion was saved last during setup.
    expect(rows[0]!.companyName).toBe("Notion");
  });
});

describe("countApplications", () => {
  it("counts all of the user's applications", async () => {
    expect(await countApplications(userId, testDb.db)).toBe(4);
  });
});
