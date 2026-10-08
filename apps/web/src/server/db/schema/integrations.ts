import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";
import { integrationProviderEnum, integrationStatusEnum } from "./enums";
import { users } from "./users";

/**
 * A connected account at another service, such as Gmail. Tokens are stored
 * encrypted (see server/security/token-crypto.ts) and never leave the server.
 */
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    providerAccountId: text("provider_account_id"),
    // Shown as "Connected as …".
    providerAccountEmail: text("provider_account_email"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default([]),
    status: integrationStatusEnum("status").notNull(),
    // Gmail's historyId, for incremental sync.
    syncCursor: text("sync_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("integrations_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
  ],
).enableRLS();
