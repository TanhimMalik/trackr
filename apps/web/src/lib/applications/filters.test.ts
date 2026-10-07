import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  filtersToSearchParams,
  hasActiveFilters,
  parseApplicationFilters,
} from "./filters";

describe("parseApplicationFilters", () => {
  it("returns defaults for an empty URL", () => {
    expect(parseApplicationFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("reads every filter", () => {
    expect(
      parseApplicationFilters({
        q: "  stripe ",
        status: "INTERVIEW,FINAL_ROUND",
        source: "LINKEDIN",
        applied: "30",
        response: "waiting",
        sort: "company",
      }),
    ).toEqual({
      query: "stripe",
      statuses: ["INTERVIEW", "FINAL_ROUND"],
      sources: ["LINKEDIN"],
      appliedWithin: "30",
      response: "waiting",
      sort: "company",
    });
  });

  it("ignores unknown, repeated and malformed values", () => {
    expect(
      parseApplicationFilters({
        status: "INTERVIEW,HIRED,INTERVIEW,UNKNOWN",
        source: "MYSPACE",
        applied: "365",
        response: "maybe",
        sort: "random",
      }),
    ).toEqual({ ...EMPTY_FILTERS, statuses: ["INTERVIEW"] });
  });

  it("uses the first value when a parameter repeats", () => {
    expect(parseApplicationFilters({ q: ["one", "two"] }).query).toBe("one");
  });

  it("limits the search length", () => {
    expect(parseApplicationFilters({ q: "x".repeat(500) }).query).toHaveLength(
      100,
    );
  });
});

describe("filtersToSearchParams", () => {
  it("round-trips through the URL", () => {
    const filters = {
      query: "data dog",
      statuses: ["ASSESSMENT" as const, "INTERVIEW" as const],
      sources: ["REFERRAL" as const],
      appliedWithin: "7" as const,
      response: "responded" as const,
      sort: "status" as const,
    };
    const params = filtersToSearchParams(filters);
    expect(parseApplicationFilters(Object.fromEntries(params))).toEqual(
      filters,
    );
  });

  it("omits defaults", () => {
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe("");
  });
});

describe("hasActiveFilters", () => {
  it("ignores sorting", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: "oldest" })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: "a" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, response: "waiting" })).toBe(
      true,
    );
  });
});
