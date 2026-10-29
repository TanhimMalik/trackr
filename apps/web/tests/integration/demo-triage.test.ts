import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applications } from "@/server/db/schema";
import { DEMO_TABS } from "@/server/demo/tabs";
import { demoTriage, saveDemoTriage } from "@/server/services/demo-triage";
import { seedDemoWorkspace } from "@/server/services/demo-workspace";
import { fitIsCurrent, getResumeProfile } from "@/server/services/fit";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date();

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
  await seedDemoWorkspace(userId, { now }, testDb.db);
});

describe("demoTriage", () => {
  it("scores each sample posting from its ratings, every quote from the posting", async () => {
    const items = await demoTriage(userId, { now }, testDb.db);
    expect(
      Object.fromEntries(
        items.map((item) => [item.key, [item.fit.score, item.fit.label]]),
      ),
    ).toEqual({
      northwind: [91, "STRONG"],
      contoso: [81, "STRONG"],
      wingtip: [68, "POSSIBLE"],
      tailspin: [54, "STRETCH"],
      fabrikam: [36, "STRETCH"],
      supabase: [95, "STRONG"],
    });
    // A quote the model gave is always found in the posting.
    for (const tab of DEMO_TABS) {
      const item = items.find((candidate) => candidate.key === tab.id);
      if (!tab.posting || !item) continue;
      for (const criterion of item.fit.criteria) {
        const given = tab.posting.ratings[criterion.key].evidence;
        expect(criterion.evidence, `${tab.id} ${criterion.key}`).toBe(given);
      }
    }
  });

  it("marks the posting the demo already tracks", async () => {
    const items = await demoTriage(userId, { now }, testDb.db);
    const tracked = items.filter((item) => item.applicationId !== null);
    expect(tracked.map((item) => item.key)).toEqual(["supabase"]);
  });
});

describe("saveDemoTriage", () => {
  it("saves postings through the extension's pipeline, already scored", async () => {
    expect(
      await saveDemoTriage(
        userId,
        ["northwind", "contoso"],
        { now },
        testDb.db,
      ),
    ).toBe(2);
    const rows = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    const saved = rows.filter((row) =>
      ["Northwind Pay", "Contoso Cloud"].includes(row.companyName),
    );
    expect(saved).toHaveLength(2);
    const profile = await getResumeProfile(userId, testDb.db);
    for (const row of saved) {
      expect(row.currentStatus).toBe("SAVED");
      expect(row.jobDescription).toBeTruthy();
      expect(fitIsCurrent(row.fit, row.fitScoredAt, profile!.updatedAt)).toBe(
        true,
      );
    }

    // Triaging again shows them as tracked.
    const items = await demoTriage(userId, { now }, testDb.db);
    expect(
      items
        .filter((item) => item.applicationId !== null)
        .map((item) => item.key)
        .sort(),
    ).toEqual(["contoso", "northwind", "supabase"]);
  });
});
