import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applications, emails, reviewItems } from "@/server/db/schema";
import { DEMO_EMAILS, type DemoEmail } from "@/server/demo/emails";
import { getApplication } from "@/server/services/applications";
import { deliverDemoEmail } from "@/server/services/demo-inbox";
import {
  resetDemoWorkspace,
  seedDemoWorkspace,
} from "@/server/services/demo-workspace";
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

const deliver = (id: DemoEmail["id"]) =>
  deliverDemoEmail(
    userId,
    DEMO_EMAILS.find((email) => email.id === id)!,
    {},
    testDb.db,
  );

async function applicationAt(companyName: string) {
  const [row] = await testDb.db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.companyName, companyName),
      ),
    );
  return row;
}

describe("demo inbox", () => {
  it("moves the matching application forward", async () => {
    const plaid = await applicationAt("Plaid");
    const { outcome, applicationId } = await deliver("interview");
    expect(outcome).toBe("applied");
    expect(applicationId).toBe(plaid!.id);
    expect((await applicationAt("Plaid"))!.currentStatus).toBe("INTERVIEW");
  });

  it("records an assessment and a rejection on the right applications", async () => {
    expect((await deliver("assessment")).outcome).toBe("applied");
    expect((await applicationAt("Linear"))!.currentStatus).toBe("ASSESSMENT");
    expect((await deliver("rejection")).outcome).toBe("applied");
    expect((await applicationAt("Coinbase"))!.currentStatus).toBe("REJECTED");
  });

  it("starts an application from a confirmation it doesn't know", async () => {
    expect(await applicationAt("Mercury")).toBeUndefined();
    const { outcome } = await deliver("confirmation");
    expect(outcome).toBe("created");
    const mercury = await applicationAt("Mercury");
    expect(mercury).toMatchObject({
      jobTitle: "Full Stack Engineer",
      currentStatus: "APPLIED",
    });
  });

  it("asks about a recruiter it can't place", async () => {
    expect((await deliver("recruiter")).outcome).toBe("review");
    const items = await testDb.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.userId, userId));
    // The seeded one, and this one.
    expect(items.map((item) => item.kind)).toEqual([
      "EMAIL_UNMATCHED",
      "EMAIL_UNMATCHED",
    ]);
  });

  it("ignores a newsletter", async () => {
    expect((await deliver("newsletter")).outcome).toBe("ignored");
  });

  it("can deliver the same sample again", async () => {
    await deliver("newsletter");
    await deliver("newsletter");
    const rows = await testDb.db
      .select()
      .from(emails)
      .where(
        and(eq(emails.userId, userId), eq(emails.processingStatus, "IGNORED")),
      );
    expect(rows).toHaveLength(2);
  });

  it("shows the email on the application's timeline, with no Gmail link", async () => {
    const { applicationId } = await deliver("interview");
    const { events } = await getApplication(userId, applicationId!, testDb.db);
    const fromEmail = events.find(
      (event) => event.eventType === "INTERVIEW_REQUESTED",
    );
    expect(fromEmail?.email).toMatchObject({
      senderName: "Plaid Recruiting",
      subject: "Next steps for your Plaid application",
    });
    expect(fromEmail?.email?.gmailMessageId).toMatch(/^demo-/);
  });

  it("is cleared when the demo is reset", async () => {
    await deliver("recruiter");
    await deliver("confirmation");
    await resetDemoWorkspace(userId, {}, testDb.db);
    expect(await applicationAt("Mercury")).toBeUndefined();
    const items = await testDb.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.userId, userId));
    // Back to the one the sample data starts with.
    expect(items).toHaveLength(1);
  });
});

describe("seeded demo emails", () => {
  it("starts with one email waiting for review", async () => {
    const items = await testDb.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.userId, userId));
    expect(items).toMatchObject([{ kind: "EMAIL_UNMATCHED", state: "OPEN" }]);
  });

  it("gives every email event an email to preview", async () => {
    const [cloudflare] = await testDb.db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          eq(applications.companyName, "Cloudflare"),
        ),
      );
    const { events } = await getApplication(userId, cloudflare!.id, testDb.db);
    const emailEvents = events.filter((event) => event.sourceType === "EMAIL");
    expect(emailEvents.length).toBeGreaterThan(0);
    for (const event of emailEvents) expect(event.email).not.toBeNull();
    const rejection = emailEvents.find(
      (event) => event.eventType === "REJECTION_RECEIVED",
    );
    expect(rejection?.email).toMatchObject({
      subject: "Your application to Cloudflare",
      senderEmail: "no-reply@us.greenhouse-mail.io",
    });
    expect(rejection?.email?.evidence).toMatch(/other candidates/);
  });
});
