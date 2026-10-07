import { describe, expect, it } from "vitest";
import {
  formatRelativeTime,
  formatSalary,
  formatShortDate,
  initials,
} from "./format";

describe("initials", () => {
  it.each([
    ["Tanhim Malik", "TM"],
    ["Ada", "A"],
    ["  grace  brewster hopper ", "GH"],
    ["jane.doe@example.com", "J"],
    ["", "?"],
  ])("%s → %s", (input, expected) => {
    expect(initials(input)).toBe(expected);
  });
});

const now = new Date("2026-10-07T18:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatShortDate", () => {
  it("omits the year within the current year", () => {
    expect(
      formatShortDate(new Date("2026-04-22T12:00:00Z"), {
        now,
        timeZone: "UTC",
      }),
    ).toBe("Apr 22");
  });

  it("includes the year for other years", () => {
    expect(
      formatShortDate(new Date("2025-04-22T12:00:00Z"), {
        now,
        timeZone: "UTC",
      }),
    ).toBe("Apr 22, 2025");
  });

  it("uses the viewer's time zone", () => {
    const lateUtc = new Date("2026-10-05T02:00:00Z");
    expect(formatShortDate(lateUtc, { now, timeZone: "UTC" })).toBe("Oct 5");
    expect(formatShortDate(lateUtc, { now, timeZone: "America/Toronto" })).toBe(
      "Oct 4",
    );
  });
});

describe("formatRelativeTime", () => {
  it.each([
    [10_000, "just now"],
    [14 * MINUTE, "14 min ago"],
    [HOUR + 5 * MINUTE, "1 hour ago"],
    [5 * HOUR, "5 hours ago"],
    [DAY + HOUR, "yesterday"],
    [4 * DAY, "4 days ago"],
    [9 * DAY, "Sep 28"],
  ])("%d ms ago → %s", (elapsed, expected) => {
    expect(formatRelativeTime(ago(elapsed), { now, timeZone: "UTC" })).toBe(
      expected,
    );
  });

  it("shows a date for times in the future", () => {
    expect(
      formatRelativeTime(new Date(now.getTime() + 3 * DAY), {
        now,
        timeZone: "UTC",
      }),
    ).toBe("Oct 10");
  });
});

describe("formatSalary", () => {
  it.each([
    [150_000, 185_000, "USD", "$150K – $185K"],
    [152_500, null, "USD", "From $152.5K"],
    [null, 90_000, "CAD", "Up to CA$90K"],
    [120_000, 120_000, "EUR", "€120K"],
    [null, null, "USD", null],
  ] as const)("%s–%s %s → %s", (min, max, currency, expected) => {
    expect(formatSalary(min, max, currency)).toBe(expected);
  });

  it("assumes US dollars when no currency is stored", () => {
    expect(formatSalary(100_000, null, null)).toBe("From $100K");
  });
});
