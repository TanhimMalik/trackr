import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { extensionSessions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { assertId } from "./ids";
import { NotFoundError } from "./errors";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const CONNECT_CODE_TTL_MS = 60 * SECOND_MS;
const ACCESS_TOKEN_TTL_MS = HOUR_MS;
const REFRESH_TOKEN_TTL_MS = 30 * DAY_MS;
// `last_used_at` is only written when it is at least this stale.
const LAST_USED_PRECISION_MS = 5 * MINUTE_MS;

/** A connect code, refresh token or access token that isn't (or is no longer) valid. */
export class InvalidGrantError extends Error {
  constructor() {
    super("The code or token is invalid or has expired");
    this.name = "InvalidGrantError";
  }
}

const secret = (prefix: string) =>
  `${prefix}_${randomBytes(32).toString("base64url")}`;

/** Secrets are random and long, so a fast hash is enough to keep them unreadable at rest. */
const hashSecret = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export type ExtensionTokens = {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
};

function issueTokens(now: Date) {
  const tokens: ExtensionTokens = {
    accessToken: secret("trk_at"),
    accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
    refreshToken: secret("trk_rt"),
    refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  };
  return {
    tokens,
    values: {
      accessTokenHash: hashSecret(tokens.accessToken),
      accessExpiresAt: tokens.accessExpiresAt,
      refreshTokenHash: hashSecret(tokens.refreshToken),
      refreshExpiresAt: tokens.refreshExpiresAt,
      lastUsedAt: now,
    },
  };
}

/**
 * Starts connecting a browser: a pending session with a one-time code the
 * connect page hands to the extension. Codes left unused are cleaned up.
 */
export async function createConnectCode(
  userId: string,
  label: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<{ code: string; expiresAt: Date }> {
  await db
    .delete(extensionSessions)
    .where(
      and(
        eq(extensionSessions.userId, userId),
        isNull(extensionSessions.refreshTokenHash),
        lt(extensionSessions.codeExpiresAt, now),
      ),
    );

  const code = secret("trk_code");
  const expiresAt = new Date(now.getTime() + CONNECT_CODE_TTL_MS);
  await db.insert(extensionSessions).values({
    userId,
    label: label.slice(0, 100),
    codeHash: hashSecret(code),
    codeExpiresAt: expiresAt,
  });
  return { code, expiresAt };
}

/** Trades a connect code for tokens. Each code works once, within a minute. */
export async function exchangeConnectCode(
  code: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<ExtensionTokens> {
  const { tokens, values } = issueTokens(now);
  const [session] = await db
    .update(extensionSessions)
    .set({ ...values, codeHash: null, codeExpiresAt: null })
    .where(
      and(
        eq(extensionSessions.codeHash, hashSecret(code)),
        gt(extensionSessions.codeExpiresAt, now),
        isNull(extensionSessions.revokedAt),
      ),
    )
    .returning({ id: extensionSessions.id });
  if (!session) throw new InvalidGrantError();
  return tokens;
}

/**
 * Issues new tokens for a refresh token. The refresh token is replaced, so
 * an old one can never be used twice.
 */
export async function refreshExtensionTokens(
  refreshToken: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<ExtensionTokens> {
  const { tokens, values } = issueTokens(now);
  const [session] = await db
    .update(extensionSessions)
    .set(values)
    .where(
      and(
        eq(extensionSessions.refreshTokenHash, hashSecret(refreshToken)),
        gt(extensionSessions.refreshExpiresAt, now),
        isNull(extensionSessions.revokedAt),
      ),
    )
    .returning({ id: extensionSessions.id });
  if (!session) throw new InvalidGrantError();
  return tokens;
}

export type ExtensionAuth = { sessionId: string; userId: string };

/** The session an access token belongs to, or null if it isn't valid. */
export async function authenticateExtensionToken(
  accessToken: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<ExtensionAuth | null> {
  const [session] = await db
    .select({
      sessionId: extensionSessions.id,
      userId: extensionSessions.userId,
      lastUsedAt: extensionSessions.lastUsedAt,
    })
    .from(extensionSessions)
    .where(
      and(
        eq(extensionSessions.accessTokenHash, hashSecret(accessToken)),
        gt(extensionSessions.accessExpiresAt, now),
        isNull(extensionSessions.revokedAt),
      ),
    );
  if (!session) return null;

  if (
    !session.lastUsedAt ||
    now.getTime() - session.lastUsedAt.getTime() > LAST_USED_PRECISION_MS
  ) {
    await db
      .update(extensionSessions)
      .set({ lastUsedAt: now })
      .where(eq(extensionSessions.id, session.sessionId));
  }
  return { sessionId: session.sessionId, userId: session.userId };
}

export type ConnectedBrowser = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

/** Browsers that are connected now: exchanged, not revoked and not expired. */
export async function listConnectedBrowsers(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<ConnectedBrowser[]> {
  return db
    .select({
      id: extensionSessions.id,
      label: extensionSessions.label,
      createdAt: extensionSessions.createdAt,
      lastUsedAt: extensionSessions.lastUsedAt,
    })
    .from(extensionSessions)
    .where(
      and(
        eq(extensionSessions.userId, userId),
        isNull(extensionSessions.revokedAt),
        gt(extensionSessions.refreshExpiresAt, now),
      ),
    )
    .orderBy(desc(extensionSessions.createdAt));
}

/** Disconnects a browser at once: its tokens stop working. */
export async function revokeExtensionSession(
  userId: string,
  sessionId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<void> {
  assertId(sessionId, "Browser");
  const revoked = await db
    .update(extensionSessions)
    .set({
      revokedAt: now,
      codeHash: null,
      accessTokenHash: null,
      refreshTokenHash: null,
    })
    .where(
      and(
        eq(extensionSessions.id, sessionId),
        eq(extensionSessions.userId, userId),
        isNull(extensionSessions.revokedAt),
      ),
    )
    .returning({ id: extensionSessions.id });
  if (revoked.length === 0) throw new NotFoundError("Browser");
}
