import "server-only";
import type { IntegrationStatus } from "@trackr/domain";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { integrations, notifications } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import type { GoogleOAuthConfig } from "@/server/env";
import {
  GMAIL_READONLY_SCOPE,
  InvalidGrantError,
  refreshAccessToken,
  revokeToken,
  type Fetch,
  type GoogleTokens,
} from "@/server/integrations/google-oauth";
import { decryptSecret, encryptSecret } from "@/server/security/token-crypto";

// Refresh a little early, so a token never expires mid-sync.
const EXPIRY_MARGIN_MS = 60 * 1000;

/** The person unchecked Gmail access on Google's consent screen. */
export class MissingGmailScopeError extends Error {
  constructor() {
    super("Gmail read access wasn't granted");
    this.name = "MissingGmailScopeError";
  }
}

/** Gmail must be connected again: access was revoked or has expired. */
export class GmailReauthRequiredError extends Error {
  constructor() {
    super("Gmail needs to be reconnected");
    this.name = "GmailReauthRequiredError";
  }
}

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail isn't connected");
    this.name = "GmailNotConnectedError";
  }
}

export type GmailConnection = {
  status: IntegrationStatus;
  email: string | null;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  lastErrorCode: string | null;
};

const gmailOf = (userId: string) =>
  and(eq(integrations.userId, userId), eq(integrations.provider, "GMAIL"));

/** The user's Gmail connection as Integrations shows it, if there ever was one. */
export async function getGmailConnection(
  userId: string,
  db: Database = getDb(),
): Promise<GmailConnection | null> {
  const [row] = await db
    .select({
      status: integrations.status,
      email: integrations.providerAccountEmail,
      connectedAt: integrations.createdAt,
      lastSyncedAt: integrations.lastSyncedAt,
      lastErrorCode: integrations.lastErrorCode,
    })
    .from(integrations)
    .where(gmailOf(userId));
  return row ?? null;
}

/** Stores a fresh grant from Google's consent screen, encrypted. */
export async function saveGmailConnection(
  userId: string,
  tokens: GoogleTokens,
  db: Database = getDb(),
): Promise<void> {
  if (!tokens.scopes.includes(GMAIL_READONLY_SCOPE)) {
    throw new MissingGmailScopeError();
  }
  const values = {
    status: "CONNECTED" as const,
    providerAccountId: tokens.account?.id ?? null,
    providerAccountEmail: tokens.account?.email ?? null,
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    tokenExpiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    lastErrorCode: null,
    lastErrorAt: null,
    // Google only sends a refresh token when it issues a new one.
    ...(tokens.refreshToken
      ? { refreshTokenEncrypted: encryptSecret(tokens.refreshToken) }
      : {}),
  };
  await db
    .insert(integrations)
    .values({ userId, provider: "GMAIL", ...values })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: values,
    });
}

async function markNeedsReauth(tx: Database, userId: string, now: Date) {
  await tx
    .update(integrations)
    .set({
      status: "NEEDS_REAUTH",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      lastErrorCode: "invalid_grant",
      lastErrorAt: now,
    })
    .where(gmailOf(userId));
  await tx
    .insert(notifications)
    .values({
      userId,
      type: "INTEGRATION_ERROR",
      title: "Reconnect Gmail to keep your applications up to date",
      body: "Google ended Trackr's access, which happens every 7 days while the app is in testing.",
      dedupeKey: `gmail-reauth:${now.toISOString().slice(0, 10)}`,
    })
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    });
}

/**
 * A valid Gmail access token, refreshed when it is about to expire. If Google
 * rejects the refresh, the connection is marked for reconnecting and the
 * user is told.
 */
export async function getGmailAccessToken(
  userId: string,
  config: GoogleOAuthConfig,
  {
    fetchImpl = fetch,
    now = new Date(),
  }: { fetchImpl?: Fetch; now?: Date } = {},
  db: Database = getDb(),
): Promise<string> {
  const [row] = await db.select().from(integrations).where(gmailOf(userId));
  if (!row || row.status === "DISCONNECTED") throw new GmailNotConnectedError();
  if (row.status === "NEEDS_REAUTH" || !row.refreshTokenEncrypted) {
    throw new GmailReauthRequiredError();
  }

  if (
    row.accessTokenEncrypted &&
    row.tokenExpiresAt &&
    row.tokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > now.getTime()
  ) {
    return decryptSecret(row.accessTokenEncrypted);
  }

  let tokens: GoogleTokens;
  try {
    tokens = await refreshAccessToken(
      config,
      decryptSecret(row.refreshTokenEncrypted),
      { fetchImpl, now },
    );
  } catch (error) {
    if (error instanceof InvalidGrantError) {
      await db.transaction((tx) => markNeedsReauth(tx, userId, now));
      throw new GmailReauthRequiredError();
    }
    throw error;
  }
  await db
    .update(integrations)
    .set({
      accessTokenEncrypted: encryptSecret(tokens.accessToken),
      tokenExpiresAt: tokens.expiresAt,
      ...(tokens.refreshToken
        ? { refreshTokenEncrypted: encryptSecret(tokens.refreshToken) }
        : {}),
    })
    .where(gmailOf(userId));
  return tokens.accessToken;
}

/** Revokes Trackr's access at Google and forgets the tokens. */
export async function disconnectGmail(
  userId: string,
  { fetchImpl = fetch }: { fetchImpl?: Fetch } = {},
  db: Database = getDb(),
): Promise<void> {
  const [row] = await db.select().from(integrations).where(gmailOf(userId));
  if (!row) return;
  const token = row.refreshTokenEncrypted ?? row.accessTokenEncrypted;
  if (token) await revokeToken(decryptSecret(token), { fetchImpl });
  await db
    .update(integrations)
    .set({
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      syncCursor: null,
    })
    .where(gmailOf(userId));
}
