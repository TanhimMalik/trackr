import "server-only";
import { lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

export type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counts one request against a fixed window and says whether it is within
 * the limit. Old windows are cleaned up now and then, not on every call.
 */
export async function consumeRateLimit(
  key: string,
  {
    limit,
    windowMs,
    now = new Date(),
  }: {
    limit: number;
    windowMs: number;
    now?: Date;
  },
  db: Database = getDb(),
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [bucket] = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });

  if (Math.random() < 0.01) {
    await db
      .delete(rateLimitBuckets)
      .where(
        lt(rateLimitBuckets.windowStart, new Date(now.getTime() - DAY_MS)),
      );
  }

  if ((bucket?.count ?? 0) <= limit) return { allowed: true };
  const windowEnd = windowStart.getTime() + windowMs;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowEnd - now.getTime()) / 1000),
    ),
  };
}
