import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./navigation";

describe("isNavItemActive", () => {
  it("matches the exact section path", () => {
    expect(isNavItemActive("/applications", "/applications")).toBe(true);
  });

  it("matches nested pages within a section", () => {
    expect(isNavItemActive("/applications/abc123", "/applications")).toBe(true);
    expect(isNavItemActive("/settings/automation", "/settings")).toBe(true);
  });

  it("does not match sections that only share a prefix", () => {
    expect(isNavItemActive("/applications-archive", "/applications")).toBe(
      false,
    );
  });

  it("does not match unrelated sections", () => {
    expect(isNavItemActive("/overview", "/applications")).toBe(false);
    expect(isNavItemActive("/", "/overview")).toBe(false);
  });
});
