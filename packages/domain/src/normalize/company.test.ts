import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "./company";

describe("normalizeCompanyName", () => {
  it.each([
    ["Datadog", "datadog"],
    ["Datadog, Inc.", "datadog"],
    ["DATADOG INC", "datadog"],
    ["Google LLC", "google"],
    ["Acme Corp.", "acme"],
    ["Spotify AB", "spotify"],
    ["Société Générale S.A.", "societe generale"],
  ])("removes legal suffixes and formatting: %s", (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected);
  });

  it.each([
    ["Datadog Hiring Team", "datadog"],
    ["Stripe Recruiting", "stripe"],
    ["Figma Talent Acquisition", "figma"],
    ["Ramp Careers", "ramp"],
    ["Plaid Recruiting Team", "plaid"],
  ])("removes ATS display suffixes: %s", (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected);
  });

  it.each([
    ["Monday.com", "monday"],
    ["Character.ai", "character"],
    ["The Trade Desk", "trade desk"],
    ["AT&T", "at and t"],
    ["Macy's", "macys"],
  ])("handles web names, articles and punctuation: %s", (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected);
  });

  it("keeps words that distinguish companies", () => {
    expect(normalizeCompanyName("Scale AI")).toBe("scale ai");
    expect(normalizeCompanyName("Meta Platforms, Inc.")).toBe("meta platforms");
  });

  it("never reduces a name to nothing", () => {
    expect(normalizeCompanyName("Careers")).toBe("careers");
    expect(normalizeCompanyName("Company")).toBe("company");
  });

  it("treats variants of the same company as equal", () => {
    const variants = ["Notion", "Notion Labs, Inc.", "notion hiring team"];
    const normalized = new Set(variants.map(normalizeCompanyName));
    // "Labs" is kept on purpose: it is part of some companies' names.
    expect(normalized).toEqual(new Set(["notion", "notion labs"]));
  });
});
