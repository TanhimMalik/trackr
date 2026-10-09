import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  applicationEvents,
  applications,
  emails,
  notifications,
  reviewItems,
  users,
} from "@/server/db/schema";
import { GMAIL_READONLY_SCOPE } from "@/server/integrations/google-oauth";
import { createApplication } from "@/server/services/applications";
import { routeEmail, type EmailSignal } from "@/server/services/email-routing";
import { saveGmailConnection } from "@/server/services/gmail-connection";
import {
  deleteAccount,
  deleteEmailData,
  exportUserData,
} from "@/server/services/privacy";
import {
  getEmailAutomation,
  setEmailAutomation,
} from "@/server/services/settings";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
let applicationId: string;
const now = new Date();

beforeAll(async () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  testDb = await createTestDatabase();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
  ({ id: applicationId } = await createApplication(
    userId,
    { companyName: "Initech", jobTitle: "Analyst", appliedAt: daysAgo(5) },
    testDb.db,
  ));
  await saveGmailConnection(
    userId,
    {
      accessToken: "ya29.secret-access-token",
      refreshToken: "1//secret-refresh-token",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      scopes: [GMAIL_READONLY_SCOPE],
      account: { id: "g-1", email: "sam@gmail.com" },
    },
    testDb.db,
  );
  const [kept] = await testDb.db
    .insert(emails)
    .values([
      {
        userId,
        gmailMessageId: "m-kept",
        gmailThreadId: "t-kept",
        receivedAt: now,
        subject: "Your application to Globex",
        processingStatus: "NEEDS_REVIEW",
      },
      {
        userId,
        gmailMessageId: "m-ignored",
        gmailThreadId: "t-ignored",
        receivedAt: now,
        processingStatus: "IGNORED",
      },
    ])
    .returning();
  const [review] = await testDb.db
    .insert(reviewItems)
    .values({
      userId,
      kind: "EMAIL_UNMATCHED",
      emailId: kept!.id,
      dedupeKey: "email:m-kept",
    })
    .returning();
  await testDb.db.insert(notifications).values({
    userId,
    type: "REVIEW_NEEDED",
    title: "Check an email from Globex",
    dedupeKey: `review:${review!.id}`,
  });
});

describe("exportUserData", () => {
  it("includes applications and job email, never secrets", async () => {
    const data = await exportUserData(userId, { now }, testDb.db);
    expect(data.applications).toHaveLength(1);
    expect(data.applicationEvents.length).toBeGreaterThan(0);
    expect(data.emails.map((email) => email.gmailMessageId)).toEqual([
      "m-kept",
    ]);
    expect(data.integrations).toEqual([
      expect.objectContaining({
        provider: "GMAIL",
        accountEmail: "sam@gmail.com",
      }),
    ]);
    const text = JSON.stringify(data);
    expect(text).not.toContain("secret-access-token");
    expect(text).not.toContain("secret-refresh-token");
    expect(text).not.toMatch(/Encrypted|TokenHash|codeHash|syncCursor/);
  });
});

describe("deleteEmailData", () => {
  it("removes stored email and its reviews, and keeps applications", async () => {
    const { emails: deleted } = await deleteEmailData(userId, testDb.db);
    expect(deleted).toBe(2);
    const left = async (
      table: typeof emails | typeof reviewItems | typeof notifications,
    ) => testDb.db.select().from(table).where(eq(table.userId, userId));
    expect(await left(emails)).toHaveLength(0);
    expect(await left(reviewItems)).toHaveLength(0);
    expect(await left(notifications)).toHaveLength(0);
    const events = await testDb.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId));
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("deleteAccount", () => {
  it("revokes Gmail and deletes the user with everything they own", async () => {
    const revokeGmail = vi.fn(async () => {});
    await deleteAccount(userId, { revokeGmail }, testDb.db);
    expect(revokeGmail).toHaveBeenCalledOnce();
    expect(
      await testDb.db.select().from(users).where(eq(users.id, userId)),
    ).toHaveLength(0);
    expect(
      await testDb.db
        .select()
        .from(applications)
        .where(eq(applications.userId, userId)),
    ).toHaveLength(0);
  });

  it("still deletes when revoking at Google fails", async () => {
    const revokeGmail = vi.fn(async () => {
      throw new Error("network");
    });
    await deleteAccount(userId, { revokeGmail }, testDb.db);
    expect(
      await testDb.db.select().from(users).where(eq(users.id, userId)),
    ).toHaveLength(0);
  });
});

describe("email automation settings", () => {
  const signal = (fields: Partial<EmailSignal>): EmailSignal => ({
    classification: "REJECTION",
    confidence: 0.97,
    method: "RULES",
    companyName: "Initech",
    companyDomain: null,
    jobTitle: "Analyst",
    platform: null,
    atsJobId: null,
    fromEmail: "careers@initech.example",
    threadId: `t-${crypto.randomUUID()}`,
    receivedAt: now,
    ...fields,
  });

  it("defaults to applying clear updates", async () => {
    expect(await getEmailAutomation(userId, testDb.db)).toEqual({
      autoUpdateEnabled: true,
      askBeforeMediumConfidence: false,
    });
    const route = await routeEmail(testDb.db, userId, signal({}));
    expect(route).toMatchObject({ action: "apply", applicationId });
  });

  it("asks about everything with automatic updates off", async () => {
    await setEmailAutomation(
      userId,
      { autoUpdateEnabled: false, askBeforeMediumConfidence: false },
      testDb.db,
    );
    expect(await routeEmail(testDb.db, userId, signal({}))).toMatchObject({
      action: "review",
    });
    // Not even a confident confirmation from a new company starts one.
    const route = await routeEmail(
      testDb.db,
      userId,
      signal({
        classification: "APPLICATION_CONFIRMATION",
        companyName: "Globex",
        fromEmail: "no-reply@us.greenhouse-mail.io",
      }),
    );
    expect(route).toMatchObject({ action: "review", kind: "EMAIL_UNMATCHED" });
  });

  it("asks about less certain updates when told to", async () => {
    await setEmailAutomation(
      userId,
      { autoUpdateEnabled: true, askBeforeMediumConfidence: true },
      testDb.db,
    );
    expect(
      await routeEmail(testDb.db, userId, signal({ confidence: 0.85 })),
    ).toMatchObject({ action: "review" });
    expect(await routeEmail(testDb.db, userId, signal({}))).toMatchObject({
      action: "apply",
    });
  });
});
