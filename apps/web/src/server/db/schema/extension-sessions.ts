import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { users } from "./users";

/**
 * One row per browser connected through the extension. Only SHA-256 hashes
 * of the connect code and tokens are stored.
 */
export const extensionSessions = pgTable(
  "extension_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // e.g. "Chrome on macOS".
    label: text("label").notNull(),
    // The one-time connect code; cleared once exchanged.
    codeHash: text("code_hash"),
    codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
    accessTokenHash: text("access_token_hash"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    // Replaced on every refresh.
    refreshTokenHash: text("refresh_token_hash"),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("extension_sessions_code_unique")
      .on(table.codeHash)
      .where(sql`${table.codeHash} is not null`),
    uniqueIndex("extension_sessions_access_unique")
      .on(table.accessTokenHash)
      .where(sql`${table.accessTokenHash} is not null`),
    uniqueIndex("extension_sessions_refresh_unique")
      .on(table.refreshTokenHash)
      .where(sql`${table.refreshTokenHash} is not null`),
    index("extension_sessions_user_idx").on(table.userId),
  ],
).enableRLS();
