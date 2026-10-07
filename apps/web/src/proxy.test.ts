import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SetAll = (
  cookies: { name: string; value: string; options: object }[],
  headers: Record<string, string>,
) => void;

const session = vi.hoisted(() => ({
  signedIn: false,
  refreshedCookie: null as { name: string; value: string } | null,
}));

// Stands in for Supabase: reports the session state and, optionally, simulates
// a token refresh that writes a new cookie.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: SetAll } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (session.refreshedCookie) {
          options.cookies.setAll(
            [{ ...session.refreshedCookie, options: { path: "/" } }],
            { "cache-control": "private, no-store" },
          );
        }
        return {
          data: session.signedIn ? { claims: { sub: "user-1" } } : null,
          error: null,
        };
      },
    },
  }),
}));

const { proxy } = await import("./proxy");

const request = (path: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"));

const isPassThrough = (response: Response) =>
  response.headers.get("x-middleware-next") === "1";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  session.signedIn = false;
  session.refreshedCookie = null;
});

describe("proxy", () => {
  it("sends signed-out visitors to sign-in and remembers where they were going", async () => {
    const response = await proxy(request("/applications?view=board"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fapplications%3Fview%3Dboard",
    );
  });

  it("omits the destination for the root path", async () => {
    const response = await proxy(request("/"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("lets signed-out visitors reach auth pages, callbacks and API routes", async () => {
    for (const path of ["/login", "/signup", "/auth/callback", "/api/health"]) {
      expect(isPassThrough(await proxy(request(path))), path).toBe(true);
    }
  });

  it("sends signed-in users away from auth pages", async () => {
    session.signedIn = true;
    const response = await proxy(request("/login"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/overview",
    );
  });

  it("lets signed-in users through to the app", async () => {
    session.signedIn = true;
    expect(isPassThrough(await proxy(request("/applications")))).toBe(true);
  });

  it("keeps refreshed session cookies when redirecting", async () => {
    session.refreshedCookie = { name: "sb-auth-token", value: "refreshed" };
    const response = await proxy(request("/settings"));

    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toContain(
      "sb-auth-token=refreshed",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("forwards refreshed session cookies on pass-through", async () => {
    session.signedIn = true;
    session.refreshedCookie = { name: "sb-auth-token", value: "refreshed" };
    const response = await proxy(request("/overview"));

    expect(isPassThrough(response)).toBe(true);
    expect(response.headers.get("set-cookie")).toContain(
      "sb-auth-token=refreshed",
    );
  });
});
