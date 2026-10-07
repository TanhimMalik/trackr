import type { CountMetric, RateMetric } from "@trackr/domain";
import { describe, expect, it } from "vitest";
import {
  countChange,
  formatPercent,
  greetingFor,
  rateChange,
  sparklinePath,
} from "./overview";

const count = (recent: number, previous: number): CountMetric => ({
  total: recent + previous,
  recent,
  previous,
  change: previous === 0 ? null : (recent - previous) / previous,
  trend: [],
});

const rate = (change: number | null): RateMetric => ({
  value: 0.3,
  previous: null,
  change,
  numerator: 3,
  denominator: 10,
  trend: [],
});

describe("countChange", () => {
  it("compares with the previous 30 days in percent", () => {
    expect(countChange(count(12, 7))).toEqual({
      direction: "up",
      label: "71%",
      description: "Up 71% from 7 in the previous 30 days",
    });
    expect(countChange(count(3, 4))).toMatchObject({
      direction: "down",
      label: "25%",
    });
  });

  it("shows the count when there is no baseline", () => {
    expect(countChange(count(1, 0))).toMatchObject({
      direction: "up",
      label: "+1",
    });
    expect(countChange(count(0, 0))).toMatchObject({
      direction: "flat",
      label: "—",
    });
  });

  it("is flat when nothing changed", () => {
    expect(countChange(count(5, 5))).toMatchObject({
      direction: "flat",
      label: "0%",
    });
  });
});

describe("rateChange", () => {
  it("compares in percentage points", () => {
    expect(rateChange(rate(6.2))).toEqual({
      direction: "up",
      label: "6 pts",
      description: "Up 6 percentage points from 30 days ago",
    });
    expect(rateChange(rate(-1))).toMatchObject({
      direction: "down",
      label: "1 pt",
    });
  });

  it("is flat when unchanged or unknown", () => {
    expect(rateChange(rate(0.3))).toMatchObject({ direction: "flat" });
    expect(rateChange(rate(null))).toMatchObject({ label: "—" });
  });
});

describe("formatPercent", () => {
  it("rounds to whole percent", () => {
    expect(formatPercent(0.238)).toBe("24%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("sparklinePath", () => {
  const size = { width: 10, height: 10, inset: 0 };

  it("scales from zero to the largest value", () => {
    expect(sparklinePath([0, 5, 10], size)).toBe("M0 10 L5 5 L10 0");
  });

  it("skips missing values", () => {
    expect(sparklinePath([null, 0, 1], size)).toBe("M5 10 L10 0");
  });

  it("draws a flat line when every value is zero", () => {
    expect(sparklinePath([0, 0], size)).toBe("M0 10 L10 10");
  });

  it("returns null without any values", () => {
    expect(sparklinePath([null, null], size)).toBeNull();
  });
});

describe("greetingFor", () => {
  it("follows the time of day", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });
});
