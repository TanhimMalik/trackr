import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
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
  applications,
  emails,
  integrations,
  reviewItems,
} from "@/server/db/schema";
import {
  LlmUnavailableError,
  type EmailLlm,
} from "@/server/integrations/anthropic";
import { GmailApiDisabledError } from "@/server/integrations/gmail-api";
import { GMAIL_READONLY_SCOPE } from "@/server/integrations/google-oauth";
import {
  createApplication,
  getApplication,
} from "@/server/services/applications";
import {
  applyEmailReview,
  createApplicationFromEmail,
  dismissEmailReview,
  listOpenReviewItems,
  type EmailReview,
} from "@/server/services/review";
import { saveGmailConnection } from "@/server/services/gmail-connection";
import { rematchEmailReviews } from "@/server/services/email-rematch";
import { routeEmail, type EmailSignal } from "@/server/services/email-routing";
import {
  GmailSyncBusyError,
  LLM_DAILY_LIMIT,
  restartGmailSync,
  syncGmail,
} from "@/server/services/gmail-sync";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date();

beforeAll(async () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  // Tests choose their model explicitly; never a real one.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
  testDb = await createTestDatabase();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await testDb.close();
});

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

type Mail = {
  id: string;
  from: string;
  subject: string;
  body: string;
  labels?: string[];
  unsubscribe?: boolean;
};

const MAILBOX: Mail[] = [
  {
    id: "m-confirm",
    from: '"Northwind Labs Hiring Team" <no-reply@us.greenhouse-mail.io>',
    subject: "Thank you for applying to Northwind Labs",
    body: "Hi Sam, thanks for applying to the Platform Engineer position at Northwind Labs. We've received your application.",
  },
  {
    id: "m-reject",
    from: '"Fabrikam Hiring Team" <no-reply@hire.lever.co>',
    subject: "Your application to Fabrikam",
    body: "Thank you for applying for the Backend Engineer, Payments role at Fabrikam. Unfortunately, we have decided to move forward with other candidates.",
  },
  {
    id: "m-recruiter",
    from: "Daniel Ortiz <daniel@fabrikam.example>",
    subject: "Chat about your application?",
    body: "Hi Sam, could you share your availability for a quick call next week?",
  },
  {
    id: "m-outreach",
    from: "Alex Kim <alex.kim@initech.example>",
    subject: "Senior Software Engineer role at Initech",
    body: "Hi Sam, I came across your profile and think you'd be a strong fit for a senior engineering position on our team. Open to learning more?",
  },
  {
    id: "m-newsletter",
    from: "Fabrikam <news@fabrikam.example>",
    subject: "Introducing Fabrikam Pay 2.0",
    body: "Our biggest launch yet.",
    labels: ["CATEGORY_PROMOTIONS"],
    unsubscribe: true,
  },
];

/** A stand-in for the Gmail API over the mailbox above. */
function fakeGmail({
  disabled = false,
  mailbox = MAILBOX,
  rateLimitOnce = false,
}: {
  disabled?: boolean;
  mailbox?: Mail[];
  /** Gmail signals rate limits as 429, or as 403 with a reason. */
  rateLimitOnce?: false | 429 | 403;
} = {}) {
  let limited = !rateLimitOnce;
  const fullFetches: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    const json = (body: object, status = 200) =>
      new Response(JSON.stringify(body), { status });
    if (disabled) {
      return json(
        { error: { errors: [{ reason: "accessNotConfigured" }] } },
        403,
      );
    }
    if (!limited) {
      limited = true;
      return new Response(
        rateLimitOnce === 403
          ? JSON.stringify({
              error: { errors: [{ reason: "userRateLimitExceeded" }] },
            })
          : "{}",
        { status: rateLimitOnce || 429, headers: { "retry-after": "0" } },
      );
    }
    const path = url.pathname.replace("/gmail/v1/users/me", "");
    if (path === "/profile") return json({ historyId: "1000" });
    if (path === "/messages") {
      return json({
        messages: mailbox.map((mail) => ({
          id: mail.id,
          threadId: `t-${mail.id}`,
        })),
      });
    }
    if (path === "/history") {
      // Later syncs see the same messages again, which must change nothing.
      return json({
        historyId: "1001",
        history: [
          {
            messagesAdded: [
              { message: { id: "m-confirm", threadId: "t-m-confirm" } },
            ],
          },
        ],
      });
    }
    const mail = mailbox.find((item) => path === `/messages/${item.id}`);
    if (!mail) return json({}, 404);
    const format = url.searchParams.get("format");
    if (format === "full") fullFetches.push(mail.id);
    return json({
      id: mail.id,
      threadId: `t-${mail.id}`,
      labelIds: mail.labels ?? ["INBOX", "CATEGORY_UPDATES"],
      snippet: mail.body.slice(0, 160),
      // Later in the list means older.
      internalDate: String(
        now.getTime() - 60_000 * (1 + mailbox.indexOf(mail)),
      ),
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: mail.from },
          { name: "Subject", value: mail.subject },
          ...(mail.unsubscribe
            ? [{ name: "List-Unsubscribe", value: "<mailto:u@x>" }]
            : []),
        ],
        ...(format === "full" ? { body: { data: b64(mail.body) } } : {}),
      },
    });
  }) as typeof fetch;
  return { fetchImpl, fullFetches };
}

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
  await saveGmailConnection(
    userId,
    {
      accessToken: "ya29.token",
      refreshToken: "1//refresh",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      scopes: [GMAIL_READONLY_SCOPE],
      account: { id: "g-1", email: "sam@gmail.com" },
    },
    testDb.db,
  );
  await createApplication(
    userId,
    {
      companyName: "Fabrikam",
      jobTitle: "Backend Engineer, Payments",
      appliedAt: daysAgo(10),
    },
    testDb.db,
  );
});

const emailRows = () =>
  testDb.db.select().from(emails).where(eq(emails.userId, userId));

describe("syncGmail", () => {
  it("turns a mailbox into updates, new applications and questions", async () => {
    const gmail = fakeGmail();
    const result = await syncGmail(
      userId,
      { fetchImpl: gmail.fetchImpl, now },
      testDb.db,
    );

    expect(result).toEqual({
      processed: 5,
      hasMore: false,
      // Daniel's email applies itself: Fabrikam is the only open application there.
      outcomes: { created: 1, applied: 2, review: 1, ignored: 1 },
    });

    const apps = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    expect(
      apps.map((app) => [app.companyName, app.currentStatus]).sort(),
    ).toEqual([
      ["Fabrikam", "REJECTED"],
      ["Northwind Labs", "APPLIED"],
    ]);

    const rows = await emailRows();
    const byId = Object.fromEntries(
      rows.map((row) => [row.gmailMessageId, row]),
    );
    expect(byId["m-reject"]).toMatchObject({
      processingStatus: "MATCHED",
      classification: "REJECTION",
    });
    // Unrelated mail keeps identifiers only, and its body is never fetched.
    expect(byId["m-newsletter"]).toMatchObject({
      processingStatus: "IGNORED",
      subject: null,
      senderEmail: null,
    });
    expect(gmail.fullFetches).not.toContain("m-newsletter");

    const reviews = await testDb.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.userId, userId));
    expect(reviews.map((item) => item.kind)).toEqual(["EMAIL_UNMATCHED"]);
  });

  it("changes nothing when it sees the same mail again", async () => {
    const gmail = fakeGmail();
    await syncGmail(userId, { fetchImpl: gmail.fetchImpl, now }, testDb.db);
    const second = await syncGmail(
      userId,
      { fetchImpl: gmail.fetchImpl, now },
      testDb.db,
    );

    expect(second.processed).toBe(0);
    expect(await emailRows()).toHaveLength(5);
    const [row] = await testDb.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, userId));
    expect(JSON.parse(row!.syncCursor!)).toEqual({
      mode: "incremental",
      historyId: "1001",
    });
  });

  it("runs one sync at a time", async () => {
    await testDb.db
      .update(integrations)
      .set({ syncLockedUntil: new Date(now.getTime() + 60_000) })
      .where(eq(integrations.userId, userId));

    await expect(
      syncGmail(userId, { fetchImpl: fakeGmail().fetchImpl, now }, testDb.db),
    ).rejects.toBeInstanceOf(GmailSyncBusyError);
  });

  it("says so when the Gmail API isn't enabled", async () => {
    await expect(
      syncGmail(
        userId,
        { fetchImpl: fakeGmail({ disabled: true }).fetchImpl, now },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(GmailApiDisabledError);
    const [row] = await testDb.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, userId));
    expect(row).toMatchObject({
      status: "ERROR",
      lastErrorCode: "gmail_api_disabled",
      syncLockedUntil: null,
    });

    // Once the API is enabled, syncing again works and clears the error.
    await syncGmail(
      userId,
      { fetchImpl: fakeGmail().fetchImpl, now },
      testDb.db,
    );
    const [fixed] = await testDb.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, userId));
    expect(fixed).toMatchObject({ status: "CONNECTED", lastErrorCode: null });
  });
});

describe("resolving emails Trackr wasn't sure about", () => {
  // Two open Fabrikam applications, so an email that names no role is a
  // question rather than an update.
  beforeEach(async () => {
    await createApplication(
      userId,
      {
        companyName: "Fabrikam",
        jobTitle: "Frontend Engineer",
        appliedAt: daysAgo(12),
      },
      testDb.db,
    );
  });

  async function syncAndList() {
    await syncGmail(
      userId,
      { fetchImpl: fakeGmail().fetchImpl, now },
      testDb.db,
    );
    const items = (await listOpenReviewItems(
      userId,
      testDb.db,
    )) as EmailReview[];
    return {
      possible: items.find((item) => item.kind === "EMAIL_POSSIBLE_MATCH")!,
      unmatched: items.find((item) => item.kind === "EMAIL_UNMATCHED")!,
    };
  }

  it("shows each email with what Trackr would do", async () => {
    const { possible, unmatched } = await syncAndList();
    expect(possible).toMatchObject({
      eventType: "INTERVIEW_REQUESTED",
      candidate: { companyName: "Fabrikam" },
      email: {
        senderName: "Daniel Ortiz",
        subject: "Chat about your application?",
      },
    });
    expect(unmatched).toMatchObject({
      eventType: "RECRUITER_CONTACT",
      candidate: null,
      email: { companyName: "Initech" },
    });
  });

  it("applies the update to the suggested application and adds the recruiter", async () => {
    const { possible } = await syncAndList();
    const { applicationId } = await applyEmailReview(
      userId,
      possible.id,
      testDb.db,
    );

    const detail = await getApplication(userId, applicationId, testDb.db);
    expect(detail.events.map((event) => event.eventType)).toContain(
      "INTERVIEW_REQUESTED",
    );
    expect(detail.contacts).toEqual([
      expect.objectContaining({
        name: "Daniel Ortiz",
        email: "daniel@fabrikam.example",
      }),
    ]);
    const [email] = await testDb.db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.userId, userId),
          eq(emails.gmailMessageId, "m-recruiter"),
        ),
      );
    expect(email).toMatchObject({ processingStatus: "MATCHED", applicationId });
  });

  it("starts an application from an email about a new job", async () => {
    const { unmatched } = await syncAndList();
    const { applicationId } = await createApplicationFromEmail(
      userId,
      unmatched.id,
      { companyName: "Initech", jobTitle: "Senior Software Engineer" },
      testDb.db,
    );

    const detail = await getApplication(userId, applicationId, testDb.db);
    expect(detail.application).toMatchObject({
      companyName: "Initech",
      jobTitle: "Senior Software Engineer",
      companyDomain: "initech.example",
    });
    expect(detail.events.map((event) => event.sourceType)).toEqual(["EMAIL"]);
  });

  it("dismisses an email for good", async () => {
    const { unmatched } = await syncAndList();
    await dismissEmailReview(userId, unmatched.id, testDb.db);

    expect(
      (await listOpenReviewItems(userId, testDb.db)).map((item) => item.kind),
    ).toEqual(["EMAIL_POSSIBLE_MATCH"]);
    const [email] = await testDb.db
      .select()
      .from(emails)
      .where(
        and(eq(emails.userId, userId), eq(emails.gmailMessageId, "m-outreach")),
      );
    expect(email!.processingStatus).toBe("DISMISSED");
  });
});

describe("what an unknown job's email does", () => {
  const COMPANY_MAILBOX: Mail[] = [
    {
      id: "c-reject",
      from: "Globex Careers <careers@globex.example>",
      subject: "Update on your application",
      body: "Thank you for applying to Globex. Unfortunately, we have decided to move forward with other candidates.",
    },
    {
      id: "c-confirm",
      from: "Globex Careers <careers@globex.example>",
      subject: "Thank you for applying to Globex",
      body: "Hi Sam, we have received your application and will review it shortly.",
    },
    {
      id: "c-ats-reject",
      from: '"Initech Hiring Team" <no-reply@us.greenhouse-mail.io>',
      subject: "Your application to Initech",
      body: "Thank you for your interest in Initech. Unfortunately, the position has been filled.",
    },
    {
      id: "c-school",
      from: "Admissions <admissions@college.example.edu>",
      subject: "We received your application",
      body: "Thank you for applying to City College. We have received your application.",
    },
  ];

  it("starts applications from confirmations and rejections, oldest first", async () => {
    await syncGmail(
      userId,
      { fetchImpl: fakeGmail({ mailbox: COMPANY_MAILBOX }).fetchImpl, now },
      testDb.db,
    );

    const apps = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    const byCompany = Object.fromEntries(
      apps.map((app) => [app.companyName, app]),
    );
    // Confirmed first (older), then rejected by the same company's domain.
    expect(byCompany.Globex).toMatchObject({
      jobTitle: "Role not specified",
      companyDomain: "globex.example",
      currentStatus: "REJECTED",
    });
    // A rejection for a job never tracked still records it.
    expect(byCompany.Initech).toMatchObject({ currentStatus: "REJECTED" });
    // School admissions aren't job applications: not even read.
    expect(byCompany["City College"]).toBeUndefined();
    const [school] = await testDb.db
      .select()
      .from(emails)
      .where(
        and(eq(emails.userId, userId), eq(emails.gmailMessageId, "c-school")),
      );
    expect(school).toMatchObject({
      processingStatus: "IGNORED",
      subject: null,
    });
  });

  it.each([429, 403] as const)(
    "retries when Gmail rate-limits a request (%i)",
    async (status) => {
      const result = await syncGmail(
        userId,
        { fetchImpl: fakeGmail({ rateLimitOnce: status }).fetchImpl, now },
        testDb.db,
      );
      expect(result.processed).toBe(5);
    },
  );
});

describe("rematchEmailReviews", () => {
  it("applies an email read before its application existed", async () => {
    const [integration] = await testDb.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, userId));
    const [email] = await testDb.db
      .insert(emails)
      .values({
        userId,
        integrationId: integration!.id,
        gmailMessageId: "late",
        gmailThreadId: "t-late",
        receivedAt: now,
        senderEmail: "no-reply@hire.lever.co",
        senderDomain: "lever.co",
        subject: "Your application to Fabrikam",
        classification: "REJECTION",
        classificationConfidence: 0.97,
        classificationMethod: "RULES",
        companyName: "Fabrikam",
        jobTitle: "Backend Engineer, Payments",
        processingStatus: "NEEDS_REVIEW",
      })
      .returning();
    await testDb.db.insert(reviewItems).values({
      userId,
      kind: "EMAIL_UNMATCHED",
      emailId: email!.id,
      proposedEvent: {
        type: "REJECTION_RECEIVED",
        occurredAt: now.toISOString(),
        sourceType: "EMAIL",
        sourceReference: "late",
        classificationMethod: "RULES",
        confidence: 0.97,
        metadata: {},
        dedupeKey: "email:late",
      },
      dedupeKey: "email:late",
    });

    expect(await rematchEmailReviews(userId, testDb.db)).toEqual({
      applied: 1,
      created: 0,
      suggested: 0,
    });
    const apps = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    expect(
      apps.find((app) => app.companyName === "Fabrikam")!.currentStatus,
    ).toBe("REJECTED");
  });
});

describe("restartGmailSync", () => {
  it("keeps decisions and looks again at everything undecided", async () => {
    const gmail = fakeGmail();
    await syncGmail(userId, { fetchImpl: gmail.fetchImpl, now }, testDb.db);
    await restartGmailSync(userId, { now }, testDb.db);

    const rows = await emailRows();
    expect(rows.map((row) => row.processingStatus).sort()).toEqual([
      "MATCHED",
      "MATCHED",
      "MATCHED",
    ]);
    expect(
      await testDb.db
        .select()
        .from(reviewItems)
        .where(eq(reviewItems.userId, userId)),
    ).toEqual([]);

    // The next sync reads the 90 days again without duplicating anything.
    await syncGmail(userId, { fetchImpl: gmail.fetchImpl, now }, testDb.db);
    expect(await emailRows()).toHaveLength(5);
    const apps = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    expect(apps).toHaveLength(2);
  });
});

describe("routing rules", () => {
  it("treats a second confirmation from a company as a second application", async () => {
    const mailbox: Mail[] = [
      {
        id: "r-second",
        from: "Globex Careers <careers@globex.example>",
        subject: "Thank you for applying to Globex",
        body: "Hi Sam, we have received your application for the Data Engineer position.",
      },
      {
        id: "r-first",
        from: "Globex Careers <careers@globex.example>",
        subject: "Thank you for applying to Globex",
        body: "Hi Sam, we have received your application and will review it shortly.",
      },
    ];
    await syncGmail(
      userId,
      { fetchImpl: fakeGmail({ mailbox }).fetchImpl, now },
      testDb.db,
    );

    const apps = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    expect(
      apps
        .filter((app) => app.companyName === "Globex")
        .map((app) => app.jobTitle)
        .sort(),
    ).toEqual(["Data Engineer", "Role not specified"]);
  });

  it("starts a new application for progress after that company said no", async () => {
    const mailbox: Mail[] = [
      {
        id: "r-assessment",
        from: "Initech <job@careers.initech.example>",
        subject:
          "Sam, You're invited! Assessment for (General Hire) Software Engineer Intern - 2027 Summer - Initech Early Careers",
        body: "Your impact starts here",
      },
      {
        id: "r-rejected",
        from: '"Initech Hiring Team" <no-reply@us.greenhouse-mail.io>',
        subject: "Your application to Initech",
        body: "Thank you for your interest in Initech. Unfortunately, the position has been filled.",
      },
    ];
    await syncGmail(
      userId,
      { fetchImpl: fakeGmail({ mailbox }).fetchImpl, now },
      testDb.db,
    );

    const apps = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    const initech = apps.filter((app) => app.companyName === "Initech");
    expect(
      initech.map((app) => [app.jobTitle, app.currentStatus]).sort(),
    ).toEqual([
      ["Role not specified", "REJECTED"],
      ["Software Engineer Intern - 2027 Summer", "ASSESSMENT"],
    ]);
  });

  it("applies a company-only match when it's the only application there", async () => {
    const mailbox: Mail[] = [
      {
        id: "r-shl",
        from: "Fabrikam <noreply@shl.com>",
        subject: "Action Required: Complete your Fabrikam skills assessment",
        body: "Hello Sam, please complete your skills assessment within 5 days.",
      },
    ];
    const result = await syncGmail(
      userId,
      { fetchImpl: fakeGmail({ mailbox }).fetchImpl, now },
      testDb.db,
    );

    expect(result.outcomes.applied).toBe(1);
    const apps = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    expect(
      apps.find((app) => app.companyName === "Fabrikam")!.currentStatus,
    ).toBe("ASSESSMENT");
  });
});

describe("routing by date", () => {
  const signal = (fields: Partial<EmailSignal>): EmailSignal => ({
    classification: "REJECTION",
    confidence: 0.97,
    method: "RULES",
    companyName: "Initech",
    companyDomain: "initech.example",
    jobTitle: null,
    platform: null,
    atsJobId: null,
    fromEmail: "careers@initech.example",
    threadId: `t-${crypto.randomUUID()}`,
    receivedAt: now,
    ...fields,
  });

  it("keeps an older rejection off an application that moved forward later", async () => {
    // Read newest first: the assessment invite started the application...
    const mailbox: Mail[] = [
      {
        id: "d-assessment",
        from: "Initech <job@careers.initech.example>",
        subject:
          "Sam, You're invited! Assessment for (General Hire) Software Engineer Intern - Initech Early Careers",
        body: "Your impact starts here",
      },
    ];
    await syncGmail(
      userId,
      { fetchImpl: fakeGmail({ mailbox }).fetchImpl, now },
      testDb.db,
    );

    // ...so a rejection from the day before can't be its rejection.
    const route = await routeEmail(
      testDb.db,
      userId,
      signal({ receivedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }),
    );
    expect(route.action).toBe("create");
  });

  it("keeps earlier progress with the application a later rejection closed", async () => {
    const mailbox: Mail[] = [
      {
        id: "d-rejected",
        from: "Initech Careers <careers@initech.example>",
        subject: "Update on your application",
        body: "Thank you for applying to Initech. Unfortunately, we have decided to move forward with other candidates.",
      },
    ];
    await syncGmail(
      userId,
      { fetchImpl: fakeGmail({ mailbox }).fetchImpl, now },
      testDb.db,
    );

    // An interview invite from before the rejection belongs to that application.
    const route = await routeEmail(
      testDb.db,
      userId,
      signal({
        classification: "INTERVIEW_REQUEST",
        confidence: 0.9,
        receivedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(route.action).toBe("apply");
  });
});

describe("the model fallback", () => {
  // The rules know "other candidates", not "other applicants".
  const UNCLEAR: Mail = {
    id: "m-unclear",
    from: '"Fabrikam Hiring Team" <no-reply@hire.lever.co>',
    subject: "An update on your application",
    body: "Thank you for your patience. We've decided to pursue other applicants for the Backend Engineer, Payments role at Fabrikam.",
  };
  const answer = (
    fields: Partial<Awaited<ReturnType<EmailLlm>>["output"]>,
  ): EmailLlm => {
    const classify = vi.fn(async () => ({
      output: {
        isJobRelated: true,
        classification: "REJECTION" as const,
        companyName: "Fabrikam",
        jobTitle: "Backend Engineer, Payments",
        evidence:
          "We've decided to pursue other applicants for the Backend Engineer, Payments role at Fabrikam.",
        confidence: 0.93,
        ...fields,
      },
      model: "claude-haiku-5-5",
      inputTokens: 900,
      outputTokens: 80,
      costUsd: 0.00013,
      latencyMs: 700,
    }));
    return classify;
  };
  const sync = (llm: EmailLlm, mailbox: Mail[] = [UNCLEAR, MAILBOX[0]!]) =>
    syncGmail(
      userId,
      { fetchImpl: fakeGmail({ mailbox }).fetchImpl, now, llm },
      testDb.db,
    );
  const stored = async (id: string) => {
    const [row] = await testDb.db
      .select()
      .from(emails)
      .where(and(eq(emails.userId, userId), eq(emails.gmailMessageId, id)));
    return row!;
  };

  it("asks the model only about what the rules can't settle", async () => {
    const llm = answer({});
    await sync(llm);
    expect(llm).toHaveBeenCalledTimes(1);
    const email = await stored("m-unclear");
    expect(email).toMatchObject({
      classification: "REJECTION",
      classificationMethod: "LLM",
      processingStatus: "NEEDS_REVIEW",
    });
    // A rejection on the model's word alone is confirmed by the person.
    expect(email.classificationConfidence).toBeLessThan(0.75);
    expect(email.extractedJson).toMatchObject({
      llm: { model: "claude-haiku-5-5", inputTokens: 900 },
    });
    const [application] = await testDb.db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId));
    expect(application!.currentStatus).toBe("APPLIED");
  });

  it("keeps only ids when the model says it isn't about an application", async () => {
    await sync(answer({ isJobRelated: false, classification: "UNKNOWN" }));
    expect(await stored("m-unclear")).toMatchObject({
      processingStatus: "IGNORED",
      classificationMethod: "LLM",
      subject: null,
      snippet: null,
    });
  });

  it("falls back to the rules when the model is unavailable", async () => {
    const llm: EmailLlm = vi.fn(async () => {
      throw new LlmUnavailableError("api_529");
    });
    const result = await sync(llm);
    expect(result.processed).toBe(2);
    expect(await stored("m-unclear")).toMatchObject({
      classificationMethod: "RULES",
      processingStatus: "UNMATCHED",
      extractedJson: expect.objectContaining({ llm: { error: "api_529" } }),
    });
  });

  it("stops calling the model at the daily limit", async () => {
    await testDb.db.insert(emails).values(
      Array.from({ length: LLM_DAILY_LIMIT }, (_, i) => ({
        userId,
        gmailMessageId: `earlier-${i}`,
        gmailThreadId: `earlier-${i}`,
        receivedAt: now,
        processingStatus: "IGNORED" as const,
        classificationMethod: "LLM" as const,
      })),
    );
    const llm = answer({});
    await sync(llm);
    expect(llm).not.toHaveBeenCalled();
    expect(await stored("m-unclear")).toMatchObject({
      classificationMethod: "RULES",
    });
  });
});
