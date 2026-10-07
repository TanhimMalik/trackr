import { describe, expect, it } from "vitest";
import { routeAccess, safeRedirectPath } from "./routes";

describe("routeAccess", () => {
  it("treats the landing page, the demo and sign-in pages as entry pages", () => {
    expect(routeAccess("/")).toBe("entry");
    expect(routeAccess("/demo")).toBe("entry");
    expect(routeAccess("/login")).toBe("entry");
    expect(routeAccess("/signup")).toBe("entry");
  });

  it("leaves auth callbacks and API routes public", () => {
    expect(routeAccess("/auth/callback")).toBe("public");
    expect(routeAccess("/api/extension/applications")).toBe("public");
  });

  it("protects everything else", () => {
    expect(routeAccess("/overview")).toBe("protected");
    expect(routeAccess("/demo/anything")).toBe("protected");
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

  it("does not continue to entry pages or auth callbacks", () => {
    expect(safeRedirectPath("/")).toBe("/overview");
    expect(safeRedirectPath("/demo")).toBe("/overview");
    expect(safeRedirectPath("/login")).toBe("/overview");
    expect(safeRedirectPath("/auth/callback?code=x")).toBe("/overview");
  });
});
