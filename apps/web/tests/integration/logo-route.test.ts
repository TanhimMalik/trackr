import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signedIn: true,
  logo: null as { body: ArrayBuffer; contentType: string } | null,
}));

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: async () =>
    state.signedIn
      ? { id: "user-1", email: "a@example.com", name: null, isDemo: false }
      : null,
}));
vi.mock("@/server/integrations/logos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/integrations/logos")>()),
  fetchCompanyLogo: vi.fn(async () => state.logo),
}));

const { GET } = await import("@/app/api/logos/[domain]/route");

const get = (domain: string) =>
  GET(new NextRequest(`http://localhost:3000/api/logos/${domain}`), {
    params: Promise.resolve({ domain }),
  });

beforeEach(() => {
  state.signedIn = true;
  state.logo = {
    body: new Uint8Array([1, 2, 3]).buffer,
    contentType: "image/png",
  };
});

describe("GET /api/logos/[domain]", () => {
  it("serves the logo with private caching", async () => {
    const response = await get("stripe.com");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=604800",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("requires a signed-in user for other companies", async () => {
    state.signedIn = false;
    expect((await get("acme-corp.com")).status).toBe(401);
  });

  it("serves the demo companies' logos to anyone", async () => {
    state.signedIn = false;
    expect((await get("stripe.com")).status).toBe(200);
  });

  it("rejects anything that is not a plain domain", async () => {
    expect((await get("localhost")).status).toBe(400);
    expect((await get("169.254.169.254")).status).toBe(400);
  });

  it("answers a missing logo with no content so the initials show instead", async () => {
    state.logo = null;
    const response = await get("unknown-company.com");
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=86400",
    );
  });
});
