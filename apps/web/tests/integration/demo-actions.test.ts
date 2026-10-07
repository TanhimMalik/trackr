import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Database } from "@/server/db/types";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser } from "../helpers/fixtures";

// The demo actions run against PGlite with Supabase and Next.js stubbed out.
const context = vi.hoisted(() => ({
  db: undefined as Database | undefined,
  anonymousId: "",
  signInError: null as { code: string } | null,
  signOut: vi.fn(async () => ({ error: null })),
  afterCallbacks: [] as (() => unknown)[],
  current: { id: "", isDemo: true },
}));

vi.mock("@/server/db/client", () => ({ getDb: () => context.db }));
vi.mock("@/server/auth/supabase", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInAnonymously: async () =>
        context.signInError
          ? { data: { user: null }, error: context.signInError }
          : {
              data: {
                user: {
                  id: context.anonymousId,
                  email: "",
                  is_anonymous: true,
                  user_metadata: {},
                },
              },
              error: null,
            },
      signOut: context.signOut,
    },
  }),
  endSupabaseSession: context.signOut,
}));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  requireUser: async () => ({
    id: context.current.id,
    email: null,
    name: null,
    isDemo: context.current.isDemo,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => context.afterCallbacks.push(callback),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { exitDemo, resetDemo, startDemo } = await import("@/server/auth/demo");
const { countApplications, createApplication } =
  await import("@/server/services/applications");
const { userExists } = await import("@/server/services/users");
const { DEMO_APPLICATIONS } = await import("@/server/demo/applications");

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
  context.db = testDb.db;
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(() => {
  context.anonymousId = crypto.randomUUID();
  context.signInError = null;
  context.signOut.mockClear();
  context.afterCallbacks = [];
});

describe("startDemo", () => {
  it("opens a new demo workspace filled with sample data", async () => {
    await expect(startDemo()).rejects.toThrow("redirect:/overview");

    expect(await userExists(context.anonymousId)).toBe(true);
    expect(await countApplications(context.anonymousId)).toBe(
      DEMO_APPLICATIONS.length,
    );
    // Expired demos are cleared after the response.
    expect(context.afterCallbacks).toHaveLength(1);
    await context.afterCallbacks[0]!();
  });

  it("explains when demos can't be started", async () => {
    context.signInError = { code: "anonymous_provider_disabled" };
    expect(await startDemo()).toEqual({
      error: "The demo isn't available right now.",
    });

    context.signInError = { code: "over_request_rate_limit" };
    expect(await startDemo()).toEqual({
      error:
        "Too many demos were started from your network. Try again in a little while.",
    });
    expect(await userExists(context.anonymousId)).toBe(false);
  });
});

describe("resetDemo", () => {
  it("restores the sample data in a demo workspace", async () => {
    await startDemo().catch(() => {});
    context.current = { id: context.anonymousId, isDemo: true };
    await createApplication(
      context.anonymousId,
      { companyName: "Acme", jobTitle: "Engineer" },
      testDb.db,
    );

    expect(await resetDemo()).toEqual({ ok: true });
    expect(await countApplications(context.anonymousId)).toBe(
      DEMO_APPLICATIONS.length,
    );
  });

  it("refuses real accounts", async () => {
    context.current = { id: await createTestUser(testDb.db), isDemo: false };
    await expect(resetDemo()).rejects.toThrow();
  });
});

describe("exitDemo", () => {
  it("deletes the workspace and ends the session", async () => {
    await startDemo().catch(() => {});
    context.current = { id: context.anonymousId, isDemo: true };

    await expect(exitDemo()).rejects.toThrow("redirect:/");

    expect(context.signOut).toHaveBeenCalled();
    expect(await userExists(context.anonymousId)).toBe(false);
  });

  it("refuses real accounts", async () => {
    const id = await createTestUser(testDb.db);
    context.current = { id, isDemo: false };

    await expect(exitDemo()).rejects.toThrow();
    expect(await userExists(id)).toBe(true);
    expect(context.signOut).not.toHaveBeenCalled();
  });
});
