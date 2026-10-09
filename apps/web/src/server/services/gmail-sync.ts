import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import {
  emails,
  integrations,
  notifications,
  reviewItems,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { googleOAuthConfig } from "@/server/env";
import {
  gmailClient,
  GmailApiDisabledError,
  GmailHistoryExpiredError,
  GmailTemporaryError,
  GmailUnauthorizedError,
  type GmailClient,
} from "@/server/integrations/gmail-api";
import type { Fetch } from "@/server/integrations/google-oauth";
import {
  ATS_SEARCH_DOMAINS,
  backfillQuery,
} from "@/server/integrations/gmail-query";
import { processGmailMessage, type MessageOutcome } from "./email-processing";
import { rematchEmailReviews } from "./email-rematch";
import {
  getGmailAccessToken,
  GmailNotConnectedError,
} from "./gmail-connection";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the first sync reads. */
export const BACKFILL_DAYS = 90;
const BATCH_SIZE = 25;
// Stop starting new messages after this, to stay well inside serverless limits.
const TIME_BUDGET_MS = 20_000;
const LOCK_MS = 90_000;

// Where sync left off: still reading the last 90 days, or following new mail.
const cursorSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("backfill"),
    historyId: z.string(),
    after: z.number(),
    pageToken: z.string().optional(),
  }),
  z.object({
    mode: z.literal("incremental"),
    historyId: z.string(),
    pageToken: z.string().optional(),
  }),
]);
type Cursor = z.infer<typeof cursorSchema>;

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class GmailSyncBusyError extends Error {
  constructor() {
    super("A Gmail sync is already running");
    this.name = "GmailSyncBusyError";
  }
}

export class GmailNotConfiguredError extends Error {
  constructor() {
    super("Gmail isn't set up on this deployment");
    this.name = "GmailNotConfiguredError";
  }
}

export type SyncResult = {
  processed: number;
  hasMore: boolean;
  outcomes: Record<Exclude<MessageOutcome, "skipped">, number>;
};

/** The next messages to read, and where to resume once they are done. */
async function nextPage(
  client: GmailClient,
  cursor: Cursor,
): Promise<{ refs: { id: string; threadId: string }[]; next: Cursor }> {
  if (cursor.mode === "backfill") {
    const page = await client.listMessages(
      backfillQuery(cursor.after, ATS_SEARCH_DOMAINS),
      cursor.pageToken,
      BATCH_SIZE,
    );
    return {
      refs: page.messages ?? [],
      // When the past 90 days are done, follow mail from when sync began.
      next: page.nextPageToken
        ? { ...cursor, pageToken: page.nextPageToken }
        : { mode: "incremental", historyId: cursor.historyId },
    };
  }

  const page = await client.listHistory(cursor.historyId, cursor.pageToken);
  const seen = new Set<string>();
  const refs = (page.history ?? [])
    .flatMap((entry) => entry.messagesAdded ?? [])
    .map((added) => added.message)
    .filter((message) => !seen.has(message.id) && seen.add(message.id));
  return {
    refs,
    next: page.nextPageToken
      ? { ...cursor, pageToken: page.nextPageToken }
      : { mode: "incremental", historyId: page.historyId },
  };
}

/**
 * Reads the next batch of Gmail for one user and acts on it. The first run
 * works through the last 90 days; later runs follow new mail from Gmail's
 * history. Each call is bounded, and `hasMore` says whether to call again.
 * Only one sync runs per user at a time.
 */
export async function syncGmail(
  userId: string,
  {
    fetchImpl = fetch,
    now = new Date(),
    timeBudgetMs = TIME_BUDGET_MS,
  }: { fetchImpl?: Fetch; now?: Date; timeBudgetMs?: number } = {},
  db: Database = getDb(),
): Promise<SyncResult> {
  const config = googleOAuthConfig();
  if (!config) throw new GmailNotConfiguredError();

  const gmail = and(
    eq(integrations.userId, userId),
    eq(integrations.provider, "GMAIL"),
  );
  const [claimed] = await db
    .update(integrations)
    .set({ syncLockedUntil: new Date(now.getTime() + LOCK_MS) })
    .where(
      and(
        gmail,
        // After an error (say, the Gmail API was off), trying again is allowed.
        inArray(integrations.status, ["CONNECTED", "ERROR"]),
        or(
          isNull(integrations.syncLockedUntil),
          lt(integrations.syncLockedUntil, now),
        ),
      ),
    )
    .returning({
      id: integrations.id,
      syncCursor: integrations.syncCursor,
      lastSyncedAt: integrations.lastSyncedAt,
    });
  if (!claimed) {
    const [row] = await db
      .select({ status: integrations.status })
      .from(integrations)
      .where(gmail);
    if (row?.status === "CONNECTED" || row?.status === "ERROR") {
      throw new GmailSyncBusyError();
    }
    throw new GmailNotConnectedError();
  }

  const release = (values: Partial<typeof integrations.$inferInsert> = {}) =>
    db
      .update(integrations)
      .set({ syncLockedUntil: null, ...values })
      .where(eq(integrations.id, claimed.id));

  const outcomes: SyncResult["outcomes"] = {
    ignored: 0,
    applied: 0,
    created: 0,
    review: 0,
  };
  let processed = 0;
  try {
    const client = gmailClient(
      await getGmailAccessToken(userId, config, { fetchImpl, now }, db),
      fetchImpl,
    );

    let cursor = parseCursor(claimed.syncCursor);
    if (!cursor) {
      const { historyId } = await client.profile();
      cursor = {
        mode: "backfill",
        historyId,
        after: Math.floor((now.getTime() - BACKFILL_DAYS * DAY_MS) / 1000),
      };
    }

    let page: Awaited<ReturnType<typeof nextPage>>;
    try {
      page = await nextPage(client, cursor);
    } catch (error) {
      if (!(error instanceof GmailHistoryExpiredError)) throw error;
      // Too long since the last sync: search from then instead.
      const { historyId } = await client.profile();
      const since =
        claimed.lastSyncedAt ??
        new Date(now.getTime() - BACKFILL_DAYS * DAY_MS);
      cursor = {
        mode: "backfill",
        historyId,
        after: Math.floor(since.getTime() / 1000),
      };
      page = await nextPage(client, cursor);
    }

    const started = Date.now();
    let finished = true;
    // Gmail lists newest first; reading oldest first lets confirmations
    // create applications before their follow-ups arrive.
    for (const ref of [...page.refs].reverse()) {
      if (Date.now() - started > timeBudgetMs) {
        finished = false;
        break;
      }
      try {
        const outcome = await processGmailMessage(
          db,
          client,
          { userId, integrationId: claimed.id },
          ref,
        );
        if (outcome !== "skipped") {
          outcomes[outcome]++;
          processed++;
        }
      } catch (error) {
        if (
          error instanceof GmailTemporaryError ||
          error instanceof GmailUnauthorizedError ||
          error instanceof GmailApiDisabledError
        ) {
          throw error;
        }
        // A message Trackr couldn't handle is kept by id and retried next time.
        console.error("gmail_message_failed", {
          messageId: ref.id,
          error: error instanceof Error ? error.name : "unknown",
        });
        await db
          .insert(emails)
          .values({
            userId,
            integrationId: claimed.id,
            gmailMessageId: ref.id,
            gmailThreadId: ref.threadId,
            receivedAt: now,
            processingStatus: "FAILED",
            errorCode: "PROCESSING_ERROR",
          })
          .onConflictDoNothing();
      }
    }

    // Only move past a page once all of it is done; repeats are skipped.
    const next = finished ? page.next : cursor;
    await release({
      status: "CONNECTED",
      syncCursor: JSON.stringify(next),
      lastSyncedAt: now,
      lastErrorCode: null,
      lastErrorAt: null,
    });
    const hasMore = !finished || Boolean(next.pageToken);
    if (!hasMore) {
      // Emails read before their application existed get another look.
      const rematched = await rematchEmailReviews(userId, db);
      outcomes.applied += rematched.applied;
      outcomes.created += rematched.created;
      outcomes.review -= rematched.applied + rematched.created;
    }
    return { processed, hasMore, outcomes };
  } catch (error) {
    if (error instanceof GmailApiDisabledError) {
      await release({
        status: "ERROR",
        lastErrorCode: "gmail_api_disabled",
        lastErrorAt: now,
      });
    } else {
      await release(
        error instanceof GmailTemporaryError
          ? { lastErrorCode: "gmail_unavailable", lastErrorAt: now }
          : {},
      );
    }
    throw error;
  }
}

/**
 * Reads the last 90 days again with the current rules. Decisions already
 * made stay: applications, applied updates and resolved reviews. Everything
 * still undecided (ignored, unmatched or waiting for review) is looked at
 * afresh on the next sync.
 */
export async function restartGmailSync(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: integrations.id,
        lockedUntil: integrations.syncLockedUntil,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, userId),
          eq(integrations.provider, "GMAIL"),
        ),
      )
      .for("update");
    if (!row) throw new GmailNotConnectedError();
    if (row.lockedUntil && row.lockedUntil > now)
      throw new GmailSyncBusyError();

    const open = await tx
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.userId, userId),
          eq(reviewItems.state, "OPEN"),
          inArray(reviewItems.kind, [
            "EMAIL_UNMATCHED",
            "EMAIL_POSSIBLE_MATCH",
            "LOW_CONFIDENCE_UPDATE",
          ]),
        ),
      );
    if (open.length > 0) {
      await tx.delete(notifications).where(
        and(
          eq(notifications.userId, userId),
          inArray(
            notifications.dedupeKey,
            open.map((item) => `review:${item.id}`),
          ),
        ),
      );
      await tx.delete(reviewItems).where(
        inArray(
          reviewItems.id,
          open.map((item) => item.id),
        ),
      );
    }
    await tx
      .delete(emails)
      .where(
        and(
          eq(emails.userId, userId),
          inArray(emails.processingStatus, [
            "IGNORED",
            "UNMATCHED",
            "FAILED",
            "NEEDS_REVIEW",
          ]),
        ),
      );
    await tx
      .update(integrations)
      .set({ syncCursor: null, lastErrorCode: null, lastErrorAt: null })
      .where(eq(integrations.id, row.id));
  });
}
