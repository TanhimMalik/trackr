import "server-only";
import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { emails, notifications, reviewItems } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import {
  GmailMessageNotFoundError,
  type GmailClient,
} from "@/server/integrations/gmail-api";
import {
  receivedAt,
  toEmailContent,
  toEmailMetadata,
} from "@/server/integrations/gmail-message";
import {
  processIncomingEmail,
  type EmailLlmPolicy,
  type MessageOutcome,
} from "./email-processing";

/** How many times one email goes to the model before the rules' answer stays. */
export const LLM_MAX_ATTEMPTS = 3;
// Past this, an undecided email has most likely been dealt with by hand.
const RETRY_WITHIN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const llmError = sql`${emails.extractedJson} -> 'llm' ->> 'error'`;
const llmAttempts = sql<number>`coalesce((${emails.extractedJson} -> 'llm' ->> 'attempts')::int, 1)`;

/**
 * Emails the model failed to read that are still undecided: kept for a
 * second look or waiting for review. Applied updates stay as they are;
 * the timeline can undo them.
 */
function waitingForModel(userId: string, now: Date) {
  return and(
    eq(emails.userId, userId),
    inArray(emails.processingStatus, ["UNMATCHED", "NEEDS_REVIEW"]),
    sql`${llmError} is not null`,
    sql`${llmAttempts} < ${LLM_MAX_ATTEMPTS}`,
    gte(
      emails.receivedAt,
      new Date(now.getTime() - RETRY_WITHIN_DAYS * DAY_MS),
    ),
  );
}

/** How many emails are waiting for the model to try again. */
export async function countLlmRetries(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(emails)
    .where(waitingForModel(userId, now));
  return row?.total ?? 0;
}

export type LlmRetry = {
  before: "UNMATCHED" | "NEEDS_REVIEW";
  outcome: MessageOutcome;
};

/**
 * Asks the model again about emails it couldn't read before (an outage, a
 * bad key), oldest first, within its daily budget. Each email is fetched
 * from Gmail again, since only its id and headers were kept.
 */
export async function retryLlmFailures(
  db: Database,
  client: GmailClient,
  {
    userId,
    integrationId,
    llm,
  }: { userId: string; integrationId: string; llm: EmailLlmPolicy },
  {
    now = new Date(),
    limit = 10,
    deadline = Infinity,
  }: { now?: Date; limit?: number; deadline?: number } = {},
): Promise<LlmRetry[]> {
  const rows = await db
    .select({
      id: emails.id,
      gmailMessageId: emails.gmailMessageId,
      gmailThreadId: emails.gmailThreadId,
      status: emails.processingStatus,
      attempts: llmAttempts,
    })
    .from(emails)
    // Not ones that failed during this sync: the model just said no.
    .where(and(waitingForModel(userId, now), lt(emails.createdAt, now)))
    .orderBy(asc(emails.receivedAt))
    .limit(limit);

  const retries: LlmRetry[] = [];
  for (const row of rows) {
    if (Date.now() > deadline || !(await llm.allow())) break;
    let message;
    try {
      message = await client.metadata(row.gmailMessageId);
    } catch (error) {
      if (!(error instanceof GmailMessageNotFoundError)) throw error;
      // Deleted since: leave the rules' answer and stop asking.
      await db
        .update(emails)
        .set({
          extractedJson: sql`jsonb_set(${emails.extractedJson}, '{llm,attempts}', ${String(LLM_MAX_ATTEMPTS)}::jsonb)`,
        })
        .where(eq(emails.id, row.id));
      continue;
    }

    // The email's review item goes with it and comes back if still unsure;
    // its notification would otherwise be left pointing at nothing.
    const open = await db
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .where(eq(reviewItems.emailId, row.id));
    if (open.length > 0) {
      await db.delete(notifications).where(
        and(
          eq(notifications.userId, userId),
          inArray(
            notifications.dedupeKey,
            open.map((item) => `review:${item.id}`),
          ),
        ),
      );
    }

    const { outcome } = await processIncomingEmail(
      db,
      // The budget was checked above, for this email.
      { userId, integrationId, llm: { ...llm, allow: async () => true } },
      {
        ref: { id: row.gmailMessageId, threadId: row.gmailThreadId },
        receivedAt: receivedAt(message),
        metadata: toEmailMetadata(message),
        loadContent: async (metadata) =>
          toEmailContent(await client.full(row.gmailMessageId), metadata),
        llmAttempts: row.attempts,
      },
      row.id,
    );
    retries.push({
      before: row.status as LlmRetry["before"],
      outcome,
    });
  }
  return retries;
}
