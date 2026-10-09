import "server-only";
import { asc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { integrations } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import type { EmailLlm } from "@/server/integrations/anthropic";
import type { Fetch } from "@/server/integrations/google-oauth";
import { GmailSyncBusyError, syncGmail } from "./gmail-sync";

export type ScheduledSyncResult = {
  accounts: number;
  synced: number;
  /** Ran out of time before reading everything; the next run carries on. */
  unfinished: number;
  /** Already syncing (Sync now was pressed); left alone. */
  skipped: number;
  failed: number;
  processed: number;
};

/**
 * The daily job: reads new mail for every connected Gmail account, the least
 * recently synced first, until the time runs out. Each account is synced
 * the same way as Sync now, so it's bounded, locked and resumable; one
 * account failing never stops the others.
 */
export async function syncAllGmail(
  {
    deadlineMs = 50_000,
    now = () => Date.now(),
    fetchImpl,
    llm,
  }: {
    deadlineMs?: number;
    now?: () => number;
    fetchImpl?: Fetch;
    llm?: EmailLlm | null;
  } = {},
  db: Database = getDb(),
): Promise<ScheduledSyncResult> {
  const started = now();
  const accounts = await db
    .select({ userId: integrations.userId })
    .from(integrations)
    .where(inArray(integrations.status, ["CONNECTED", "ERROR"]))
    .orderBy(
      sql`${integrations.lastSyncedAt} asc nulls first`,
      asc(integrations.id),
    );

  const result: ScheduledSyncResult = {
    accounts: accounts.length,
    synced: 0,
    unfinished: 0,
    skipped: 0,
    failed: 0,
    processed: 0,
  };
  for (const { userId } of accounts) {
    let hasMore = true;
    try {
      while (hasMore) {
        const left = deadlineMs - (now() - started);
        if (left < 5_000) break;
        const batch = await syncGmail(
          userId,
          {
            timeBudgetMs: Math.min(20_000, left - 3_000),
            ...(fetchImpl ? { fetchImpl } : {}),
            ...(llm !== undefined ? { llm } : {}),
          },
          db,
        );
        result.processed += batch.processed;
        hasMore = batch.hasMore;
      }
      if (hasMore) result.unfinished++;
      else result.synced++;
    } catch (error) {
      // Someone pressing Sync now at the same moment is not a failure.
      if (error instanceof GmailSyncBusyError) {
        result.skipped++;
        continue;
      }
      result.failed++;
      console.error("scheduled_gmail_sync_failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }
    if (deadlineMs - (now() - started) < 5_000) break;
  }
  return result;
}
