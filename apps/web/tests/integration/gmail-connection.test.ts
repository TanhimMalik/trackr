import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { integrations } from "@/server/db/schema";
import {
  authorizationUrl,
  GMAIL_READONLY_SCOPE,
  GMAIL_SCOPES,
  type GoogleTokens,
} from "@/server/integrations/google-oauth";
import {
  disconnectGmail,
  getGmailAccessToken,
  getGmailConnection,
  GmailReauthRequiredError,
  MissingGmailScopeError,
  saveGmailConnection,
} from "@/server/services/gmail-connection";
import { listNotifications } from "@/server/services/notifications";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

const config = { clientId: "client-id", clientSecret: "client-secret" };
const now = new Date("2026-10-08T12:00:00Z");
let testDb: TestDatabase;
let userId: string;

beforeAll(async () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  testDb = await createTestDatabase();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
});

const grant = (fields: Partial<GoogleTokens> = {}): GoogleTokens => ({
  accessToken: "ya29.first",
  refreshToken: "1//refresh-first",
  expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  scopes: ["openid", "email", GMAIL_READONLY_SCOPE],
  account: { id: "google-123", email: "sam@gmail.com" },
  ...fields,
});

/** A stand-in for Google's token and revoke endpoints. */
function fakeGoogle(
  respond: (
    body: URLSearchParams,
    url: string,
  ) => { status: number; json: object },
) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    calls.push({ url, body });
    const { status, json } = respond(body, url);
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const stored = async () =>
  (
    await testDb.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, userId))
  )[0]!;

describe("authorizationUrl", () => {
  it("asks for read-only Gmail access, offline, with PKCE", () => {
    const url = new URL(
      authorizationUrl(config, {
        redirectUri: "https://trackr.example/api/integrations/gmail/callback",
        state: "state-123",
        verifier: "verifier-abc",
        loginHint: "sam@gmail.com",
      }),
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-id",
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: "state-123",
      code_challenge_method: "S256",
      login_hint: "sam@gmail.com",
    });
    expect(url.searchParams.get("code_challenge")).not.toBe("verifier-abc");
  });
});

describe("Gmail connection", () => {
  it("stores the grant encrypted and reports who is connected", async () => {
    await saveGmailConnection(userId, grant(), testDb.db);

    const row = await stored();
    expect(JSON.stringify(row)).not.toContain("ya29.first");
    expect(JSON.stringify(row)).not.toContain("refresh-first");
    expect(await getGmailConnection(userId, testDb.db)).toMatchObject({
      status: "CONNECTED",
      email: "sam@gmail.com",
    });
  });

  it("refuses a grant without Gmail access", async () => {
    await expect(
      saveGmailConnection(
        userId,
        grant({ scopes: ["openid", "email"] }),
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(MissingGmailScopeError);
    expect(await getGmailConnection(userId, testDb.db)).toBeNull();
  });

  it("hands out the stored token until it is about to expire, then refreshes", async () => {
    await saveGmailConnection(userId, grant(), testDb.db);
    const google = fakeGoogle(() => ({
      status: 200,
      json: {
        access_token: "ya29.second",
        expires_in: 3599,
        scope: GMAIL_SCOPES.join(" "),
      },
    }));

    expect(
      await getGmailAccessToken(
        userId,
        config,
        { fetchImpl: google.fetchImpl, now },
        testDb.db,
      ),
    ).toBe("ya29.first");
    expect(google.calls).toHaveLength(0);

    const later = new Date(now.getTime() + 59 * 60 * 1000 + 30 * 1000);
    expect(
      await getGmailAccessToken(
        userId,
        config,
        { fetchImpl: google.fetchImpl, now: later },
        testDb.db,
      ),
    ).toBe("ya29.second");
    expect(google.calls[0]!.body.get("grant_type")).toBe("refresh_token");
    expect(google.calls[0]!.body.get("refresh_token")).toBe("1//refresh-first");
  });

  it("keeps a rotated refresh token", async () => {
    await saveGmailConnection(userId, grant({ expiresAt: now }), testDb.db);
    const google = fakeGoogle((body) => ({
      status: 200,
      json: {
        access_token: `ya29.for-${body.get("refresh_token")}`,
        refresh_token: "1//refresh-second",
        expires_in: 0,
      },
    }));

    await getGmailAccessToken(
      userId,
      config,
      { fetchImpl: google.fetchImpl, now },
      testDb.db,
    );
    await getGmailAccessToken(
      userId,
      config,
      { fetchImpl: google.fetchImpl, now },
      testDb.db,
    );
    expect(google.calls.map((call) => call.body.get("refresh_token"))).toEqual([
      "1//refresh-first",
      "1//refresh-second",
    ]);
  });

  it("asks the user to reconnect when Google rejects the grant", async () => {
    await saveGmailConnection(userId, grant({ expiresAt: now }), testDb.db);
    const google = fakeGoogle(() => ({
      status: 400,
      json: { error: "invalid_grant" },
    }));

    await expect(
      getGmailAccessToken(
        userId,
        config,
        { fetchImpl: google.fetchImpl, now },
        testDb.db,
      ),
    ).rejects.toBeInstanceOf(GmailReauthRequiredError);

    const row = await stored();
    expect(row).toMatchObject({
      status: "NEEDS_REAUTH",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      lastErrorCode: "invalid_grant",
    });
    const [notification] = await listNotifications(userId, {}, testDb.db);
    expect(notification).toMatchObject({ type: "INTEGRATION_ERROR" });

    // Connecting again restores it.
    await saveGmailConnection(userId, grant(), testDb.db);
    expect((await stored()).status).toBe("CONNECTED");
  });

  it("revokes access at Google on disconnect and forgets the tokens", async () => {
    await saveGmailConnection(userId, grant(), testDb.db);
    const google = fakeGoogle(() => ({ status: 200, json: {} }));

    await disconnectGmail(userId, { fetchImpl: google.fetchImpl }, testDb.db);

    expect(google.calls[0]).toMatchObject({
      url: "https://oauth2.googleapis.com/revoke",
    });
    expect(google.calls[0]!.body.get("token")).toBe("1//refresh-first");
    expect(await stored()).toMatchObject({
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
    });
  });
});
