import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contacts, emails } from "@/server/db/schema";
import type { GmailClient } from "@/server/integrations/gmail-api";
import type { GmailMessage } from "@/server/integrations/gmail-message";
import { createApplication } from "@/server/services/applications";
import {
  exportBenchmarkEmails,
  type BenchmarkRecord,
} from "@/server/services/email-benchmark";
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

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

const message = (
  id: string,
  threadId: string,
  from: string,
  days: number,
): GmailMessage => ({
  id,
  threadId,
  labelIds: ["INBOX"],
  snippet: "Thanks for applying",
  internalDate: String(daysAgo(days).getTime()),
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: from },
      { name: "Subject", value: `Subject ${id}` },
    ],
    body: { data: b64(`Body of ${id}`) },
  },
});

const MAIL: Record<string, GmailMessage> = {
  "m-linked": message("m-linked", "t-1", "no-reply@ats.example", 10),
  "m-reply": message("m-reply", "t-1", "no-reply@ats.example", 5),
  "m-contact": message("m-contact", "t-2", "Dana <dana@acme.example>", 4),
  ...Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => [
      `m-ignored-${i}`,
      message(`m-ignored-${i}`, `t-i${i}`, "news@shop.example", 3),
    ]),
  ),
};

const reads: string[] = [];
const client = {
  full: async (id: string) => {
    reads.push(id);
    return MAIL[id]!;
  },
} as unknown as GmailClient;

async function collect(
  options: Parameters<typeof exportBenchmarkEmails>[1] = {},
) {
  const records: BenchmarkRecord[] = [];
  for await (const record of exportBenchmarkEmails(
    userId,
    { client, ...options },
    testDb.db,
  )) {
    records.push(record);
  }
  return records;
}

beforeEach(async () => {
  reads.length = 0;
  userId = await createTestUser(testDb.db);
  const application = await createApplication(
    userId,
    { companyName: "Acme", jobTitle: "Engineer", status: "APPLIED" },
    testDb.db,
  );
  await testDb.db.insert(contacts).values({
    userId,
    applicationId: application.id,
    name: "Dana",
    email: "dana@acme.example",
    contactType: "RECRUITER",
  });
  const row = (id: string, threadId: string, days: number) => ({
    userId,
    gmailMessageId: id,
    gmailThreadId: threadId,
    receivedAt: daysAgo(days),
  });
  await testDb.db.insert(emails).values([
    {
      ...row("m-linked", "t-1", 10),
      processingStatus: "MATCHED",
      applicationId: application.id,
    },
    { ...row("m-reply", "t-1", 5), processingStatus: "NEEDS_REVIEW" },
    { ...row("m-contact", "t-2", 4), processingStatus: "UNMATCHED" },
    ...Array.from({ length: 5 }, (_, i) => ({
      ...row(`m-ignored-${i}`, `t-i${i}`, 3),
      processingStatus: "IGNORED" as const,
    })),
  ]);
});

describe("exportBenchmarkEmails", () => {
  it("exports kept email and a sample of ignored email", async () => {
    const records = await collect({ ignoredSample: 2 });
    const ids = records.map((record) => record.id);
    expect(ids).toEqual(
      expect.arrayContaining(["m-linked", "m-reply", "m-contact"]),
    );
    expect(
      records.filter((record) => record.syncStatus === "IGNORED"),
    ).toHaveLength(2);
    expect(records[0]!.email.body).toMatch(/^Body of /);
  });

  it("marks threads and senders sync already knew", async () => {
    const records = await collect({ ignoredSample: 0 });
    const byId = new Map(records.map((record) => [record.id, record.email]));
    expect(byId.get("m-linked")).toMatchObject({ knownThread: false });
    expect(byId.get("m-reply")).toMatchObject({ knownThread: true });
    expect(byId.get("m-contact")).toMatchObject({
      knownThread: false,
      knownContact: true,
    });
  });

  it("samples the same ignored email each time and skips exported ones", async () => {
    const first = await collect({ ignoredSample: 2 });
    const again = await collect({ ignoredSample: 2 });
    expect(again.map((record) => record.id)).toEqual(
      first.map((record) => record.id),
    );
    reads.length = 0;
    const rest = await collect({
      ignoredSample: 2,
      skip: new Set(first.map((record) => record.id)),
    });
    expect(rest).toHaveLength(0);
    expect(reads).toHaveLength(0);
  });
});
