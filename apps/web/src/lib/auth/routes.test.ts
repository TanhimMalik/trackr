import { describe, expect, it } from "vitest";
import { routeAccess, safeRedirectPath } from "./routes";

describe("routeAccess", () => {
  it("treats sign-in and sign-up as auth pages", () => {
    expect(routeAccess("/login")).toBe("auth-page");
    expect(routeAccess("/signup")).toBe("auth-page");
  });

  it("leaves auth callbacks and API routes public", () => {
    expect(routeAccess("/auth/callback")).toBe("public");
    expect(routeAccess("/api/extension/applications")).toBe("public");
  });

  it("protects everything else", () => {
    expect(routeAccess("/")).toBe("protected");
    expect(routeAccess("/overview")).toBe("protected");
    expect(routeAccess("/applications/123")).toBe("protected");
    expect(routeAccess("/login-help")).toBe("protected");
  });
});

describe("safeRedirectPath", () => {
  it("keeps same-origin paths with their query", () => {
    expect(safeRedirectPath("/applications?view=board")).toBe(
      "/applications?view=board",
    );
    expect(safeRedirectPath("/settings")).toBe("/settings");
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["applications"],
    ["https://evil.example/phish"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
  ])("falls back to the overview for %s", (next) => {
    expect(safeRedirectPath(next)).toBe("/overview");
  });

  it("does not continue to auth pages", () => {
    expect(safeRedirectPath("/login")).toBe("/overview");
    expect(safeRedirectPath("/auth/callback?code=x")).toBe("/overview");
  });
});
