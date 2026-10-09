import "server-only";
import type { EmailContent } from "@trackr/domain";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { contacts, emails } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { googleOAuthConfig } from "@/server/env";
import { gmailClient, type GmailClient } from "@/server/integrations/gmail-api";
import {
  receivedAt,
  toEmailContent,
  toEmailMetadata,
} from "@/server/integrations/gmail-message";
import { getGmailAccessToken } from "./gmail-connection";
import { GmailNotConfiguredError } from "./gmail-sync";

/** One message as the benchmark needs it: the classifier's input. */
export type BenchmarkRecord = {
  id: string;
  receivedAt: string;
  /** What sync decided, for choosing what to label first. */
  syncStatus: string;
  email: EmailContent;
};

/**
 * Re-reads a user's synced email from Gmail for the local benchmark: every
 * message sync found job-related, plus a fixed sample of the ones it ignored,
 * so missed job email shows up too. Bodies go to the caller, never to the
 * database. For the owner's own machine only.
 */
export async function* exportBenchmarkEmails(
  userId: string,
  {
    ignoredSample = 150,
    skip = new Set<string>(),
    concurrency = 4,
    client,
  }: {
    ignoredSample?: number;
    skip?: ReadonlySet<string>;
    concurrency?: number;
    client?: GmailClient;
  } = {},
  db: Database = getDb(),
): AsyncGenerator<BenchmarkRecord> {
  const columns = {
    id: emails.gmailMessageId,
    threadId: emails.gmailThreadId,
    status: emails.processingStatus,
  };
  const [kept, ignored, linked, known] = await Promise.all([
    db
      .select(columns)
      .from(emails)
      .where(
        and(eq(emails.userId, userId), ne(emails.processingStatus, "IGNORED")),
      ),
    // A stable pseudo-random sample, so re-running adds to the same set.
    db
      .select(columns)
      .from(emails)
      .where(
        and(eq(emails.userId, userId), eq(emails.processingStatus, "IGNORED")),
      )
      .orderBy(sql`md5(${emails.gmailMessageId})`)
      .limit(ignoredSample),
    db
      .select({
        id: emails.gmailMessageId,
        threadId: emails.gmailThreadId,
        receivedAt: emails.receivedAt,
      })
      .from(emails)
      .where(and(eq(emails.userId, userId), isNotNull(emails.applicationId))),
    db
      .select({ email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), isNotNull(contacts.email))),
  ]);
  const contactEmails = new Set(known.map((row) => row.email!.toLowerCase()));

  const pending = [...kept, ...ignored].filter((row) => !skip.has(row.id));
  if (pending.length === 0) return;

  if (!client) {
    const config = googleOAuthConfig();
    if (!config) throw new GmailNotConfiguredError();
    client = gmailClient(await getGmailAccessToken(userId, config, {}, db));
  }
  const gmail = client;

  async function read(row: (typeof pending)[number]): Promise<BenchmarkRecord> {
    const message = await gmail.full(row.id);
    const received = receivedAt(message);
    const headers = toEmailMetadata(message);
    // As sync saw it: a thread already linked earlier, or a known contact.
    const knownThread = linked.some(
      (other) =>
        other.threadId === row.threadId &&
        other.id !== row.id &&
        other.receivedAt < received,
    );
    const knownContact = contactEmails.has(headers.fromEmail.toLowerCase());
    return {
      id: row.id,
      receivedAt: received.toISOString(),
      syncStatus: row.status,
      email: toEmailContent(message, { ...headers, knownThread, knownContact }),
    };
  }

  // A few at a time: Gmail rate-limits bursts of parallel requests.
  for (let start = 0; start < pending.length; start += concurrency) {
    const batch = pending.slice(start, start + concurrency);
    for (const record of await Promise.all(batch.map(read))) yield record;
  }
}
