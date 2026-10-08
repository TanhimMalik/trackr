import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { GoogleOAuthConfig } from "@/server/env";

export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SCOPES = ["openid", "email", GMAIL_READONLY_SCOPE];

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export type Fetch = typeof fetch;

/** Google rejected the grant: the user revoked access, or a testing-mode token expired. */
export class InvalidGrantError extends Error {
  constructor() {
    super("Google rejected the authorization grant");
    this.name = "InvalidGrantError";
  }
}

export class GoogleOAuthError extends Error {
  constructor(readonly status: number) {
    super(`Google token request failed (${status})`);
    this.name = "GoogleOAuthError";
  }
}

/** A random `state` and PKCE verifier for one authorization attempt. */
export function newAuthorizationAttempt() {
  return {
    state: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
  };
}

const challengeFor = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

export function authorizationUrl(
  config: GoogleOAuthConfig,
  {
    redirectUri,
    state,
    verifier,
    loginHint,
  }: {
    redirectUri: string;
    state: string;
    verifier: string;
    loginHint?: string;
  },
): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    // A refresh token, every time, so reconnecting always works.
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challengeFor(verifier),
    code_challenge_method: "S256",
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return url.toString();
}

export type GoogleTokens = {
  accessToken: string;
  /** Only present when Google issues a new one. */
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
  /** The Google account, from the ID token. */
  account: { id: string; email: string | null } | null;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
  error?: string;
};

/**
 * The ID token arrives straight from Google's token endpoint over TLS, so
 * its claims can be read without verifying the signature (OpenID Connect
 * Core 3.1.3.7).
 */
function accountFromIdToken(idToken: string | undefined) {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      sub?: string;
      email?: string;
    };
    return claims.sub ? { id: claims.sub, email: claims.email ?? null } : null;
  } catch {
    return null;
  }
}

async function tokenRequest(
  body: Record<string, string>,
  fetchImpl: Fetch,
  now: Date,
): Promise<GoogleTokens> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    if (data.error === "invalid_grant") throw new InvalidGrantError();
    throw new GoogleOAuthError(response.status);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(now.getTime() + data.expires_in * 1000),
    scopes: data.scope?.split(" ").filter(Boolean) ?? [],
    account: accountFromIdToken(data.id_token),
  };
}

export function exchangeAuthorizationCode(
  config: GoogleOAuthConfig,
  {
    code,
    verifier,
    redirectUri,
  }: { code: string; verifier: string; redirectUri: string },
  {
    fetchImpl = fetch,
    now = new Date(),
  }: { fetchImpl?: Fetch; now?: Date } = {},
): Promise<GoogleTokens> {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    },
    fetchImpl,
    now,
  );
}

export function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
  {
    fetchImpl = fetch,
    now = new Date(),
  }: { fetchImpl?: Fetch; now?: Date } = {},
): Promise<GoogleTokens> {
  return tokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    },
    fetchImpl,
    now,
  );
}

/** Revokes a token at Google. Best effort: failures are ignored. */
export async function revokeToken(
  token: string,
  { fetchImpl = fetch }: { fetchImpl?: Fetch } = {},
): Promise<void> {
  try {
    await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // Disconnecting locally is what matters; Google expires unused tokens.
  }
}
