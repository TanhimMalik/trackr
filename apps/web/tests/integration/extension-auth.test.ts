import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { extensionSessions } from "@/server/db/schema";
import { NotFoundError } from "@/server/services/errors";
import {
  authenticateExtensionToken,
  createConnectCode,
  exchangeConnectCode,
  InvalidGrantError,
  listConnectedBrowsers,
  refreshExtensionTokens,
  revokeExtensionSession,
} from "@/server/services/extension-auth";
import { consumeRateLimit } from "@/server/services/rate-limit";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
const now = new Date("2026-10-08T12:00:00Z");
const later = (ms: number) => ({ now: new Date(now.getTime() + ms) });
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
});

async function connect() {
  const { code } = await createConnectCode(
    userId,
    "Chrome on macOS",
    { now },
    testDb.db,
  );
  return exchangeConnectCode(code, { now }, testDb.db);
}

describe("connecting a browser", () => {
  it("exchanges a connect code for working tokens, once", async () => {
    const { code } = await createConnectCode(
      userId,
      "Chrome on macOS",
      { now },
      testDb.db,
    );
    const tokens = await exchangeConnectCode(code, later(10_000), testDb.db);

    expect(tokens.accessToken).toMatch(/^trk_at_/);
    expect(tokens.refreshToken).toMatch(/^trk_rt_/);
    expect(
      await authenticateExtensionToken(
        tokens.accessToken,
        later(MINUTE),
        testDb.db,
      ),
    ).toMatchObject({ userId });

    await expect(
      exchangeConnectCode(code, later(20_000), testDb.db),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects a code after a minute", async () => {
    const { code } = await createConnectCode(
      userId,
      "Chrome",
      { now },
      testDb.db,
    );
    await expect(
      exchangeConnectCode(code, later(61_000), testDb.db),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("stores only hashes", async () => {
    const tokens = await connect();
    const rows = await testDb.db.select().from(extensionSessions);
    const stored = JSON.stringify(rows);

    expect(stored).not.toContain(tokens.accessToken);
    expect(stored).not.toContain(tokens.refreshToken);
  });
});

describe("tokens", () => {
  it("stop working when the access token expires", async () => {
    const { accessToken } = await connect();
    expect(
      await authenticateExtensionToken(accessToken, later(HOUR + 1), testDb.db),
    ).toBeNull();
  });

  it("rotates the refresh token on every use", async () => {
    const first = await connect();
    const second = await refreshExtensionTokens(
      first.refreshToken,
      later(2 * HOUR),
      testDb.db,
    );

    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(
      refreshExtensionTokens(first.refreshToken, later(3 * HOUR), testDb.db),
    ).rejects.toBeInstanceOf(InvalidGrantError);
    // The new access token works; the old one no longer does.
    expect(
      await authenticateExtensionToken(
        second.accessToken,
        later(2 * HOUR),
        testDb.db,
      ),
    ).not.toBeNull();
    expect(
      await authenticateExtensionToken(
        first.accessToken,
        later(2 * HOUR),
        testDb.db,
      ),
    ).toBeNull();
  });

  it("can't be refreshed after 30 days", async () => {
    const { refreshToken } = await connect();
    await expect(
      refreshExtensionTokens(refreshToken, later(31 * DAY), testDb.db),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });
});

describe("connected browsers", () => {
  it("lists connected browsers, not pending codes", async () => {
    await createConnectCode(userId, "Edge on Windows", { now }, testDb.db);
    await connect();

    expect(
      (await listConnectedBrowsers(userId, { now }, testDb.db)).map(
        (browser) => browser.label,
      ),
    ).toEqual(["Chrome on macOS"]);
  });

  it("cuts a browser off when it is disconnected", async () => {
    const tokens = await connect();
    const [browser] = await listConnectedBrowsers(userId, { now }, testDb.db);

    await revokeExtensionSession(userId, browser!.id, { now }, testDb.db);

    expect(
      await authenticateExtensionToken(tokens.accessToken, { now }, testDb.db),
    ).toBeNull();
    await expect(
      refreshExtensionTokens(tokens.refreshToken, { now }, testDb.db),
    ).rejects.toBeInstanceOf(InvalidGrantError);
    expect(await listConnectedBrowsers(userId, { now }, testDb.db)).toEqual([]);
  });

  it("only lets the owner disconnect a browser", async () => {
    await connect();
    const [browser] = await listConnectedBrowsers(userId, { now }, testDb.db);
    const intruder = await createTestUser(testDb.db);

    await expect(
      revokeExtensionSession(intruder, browser!.id, { now }, testDb.db),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("consumeRateLimit", () => {
  it("allows requests up to the limit in each window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const options = { limit: 2, windowMs: MINUTE, now };

    expect(await consumeRateLimit(key, options, testDb.db)).toEqual({
      allowed: true,
    });
    await consumeRateLimit(key, options, testDb.db);
    expect(await consumeRateLimit(key, options, testDb.db)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(
      await consumeRateLimit(
        key,
        { ...options, now: new Date(now.getTime() + MINUTE) },
        testDb.db,
      ),
    ).toEqual({ allowed: true });
  });
});
