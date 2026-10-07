import { describe, expect, it } from "vitest";
import {
  applicationKeywords,
  applicationValue,
  isPaletteShortcut,
  matchScore,
  paletteFilter,
} from "./command-palette";

const key = (
  key: string,
  modifiers: Partial<
    Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>
  > = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe("isPaletteShortcut", () => {
  it("accepts ⌘K and Ctrl+K", () => {
    expect(isPaletteShortcut(key("k", { metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("k", { ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("K", { metaKey: true }))).toBe(true);
  });

  it("ignores plain K and other combinations", () => {
    expect(isPaletteShortcut(key("k"))).toBe(false);
    expect(isPaletteShortcut(key("k", { metaKey: true, shiftKey: true }))).toBe(
      false,
    );
    expect(isPaletteShortcut(key("k", { ctrlKey: true, altKey: true }))).toBe(
      false,
    );
    expect(isPaletteShortcut(key("j", { metaKey: true }))).toBe(false);
  });
});

describe("applicationKeywords", () => {
  it("covers company, role, location and status", () => {
    expect(
      applicationKeywords({
        companyName: "Stripe",
        jobTitle: "Software Engineer",
        location: "San Francisco, CA",
        currentStatus: "FINAL_ROUND",
      }),
    ).toEqual([
      "Stripe",
      "Software Engineer",
      "San Francisco, CA",
      "Final round",
    ]);
  });

  it("skips a missing location", () => {
    expect(
      applicationKeywords({
        companyName: "Ramp",
        jobTitle: "Engineer",
        location: null,
        currentStatus: "APPLIED",
      }),
    ).toEqual(["Ramp", "Engineer", "Applied"]);
  });
});

describe("paletteFilter", () => {
  const id = "cafe0000-beef-4000-a000-000000000000";
  const stripe = ["Stripe", "Software Engineer", "Remote", "Offer"];

  it("finds applications by their keywords", () => {
    expect(
      paletteFilter(applicationValue(id), "stripe", stripe),
    ).toBeGreaterThan(0);
    expect(
      paletteFilter(applicationValue(id), "offer", stripe),
    ).toBeGreaterThan(0);
    expect(
      paletteFilter(applicationValue(id), "remote", stripe),
    ).toBeGreaterThan(0);
  });

  it("never matches an application by its id", () => {
    expect(paletteFilter(applicationValue(id), "cafe", stripe)).toBe(0);
    expect(paletteFilter(applicationValue(id), "application", stripe)).toBe(0);
  });

  it("matches other items by their value", () => {
    expect(paletteFilter("Overview", "over")).toBeGreaterThan(0);
    expect(paletteFilter("Overview", "settings")).toBe(0);
  });
});

describe("matchScore", () => {
  const stripe = ["Stripe", "Software Engineer", "San Francisco, CA", "Offer"];
  const datadog = ["Datadog", "Software Engineer", "Montréal, QC", "Applied"];

  it("requires every typed word to match", () => {
    expect(matchScore("soft eng", stripe)).toBeGreaterThan(0);
    expect(matchScore("soft designer", stripe)).toBe(0);
  });

  it("does not match scattered letters", () => {
    // o-f-f-e-r appears in order across "Software Engineer, San Francisco".
    expect(matchScore("offer", datadog)).toBe(0);
    expect(matchScore("offer", stripe)).toBeGreaterThan(0);
  });

  it("matches inside a word from three letters", () => {
    expect(matchScore("dog", datadog)).toBeGreaterThan(0);
    expect(matchScore("og", datadog)).toBe(0);
  });

  it("ignores case and accents", () => {
    expect(matchScore("MONTREAL", datadog)).toBeGreaterThan(0);
  });

  it("ranks company matches above other matches", () => {
    expect(matchScore("str", stripe)).toBe(1);
    expect(matchScore("san", stripe)).toBeLessThan(matchScore("str", stripe));
  });

  it("matches everything when nothing is typed", () => {
    expect(matchScore("  ", stripe)).toBe(1);
  });
});
