import { describe, expect, it } from "vitest";
import {
  activityHref,
  decodeActivityCursor,
  encodeActivityCursor,
  groupByDay,
  parseActivityFilters,
} from "./activity";

const cursor = {
  eventTimestamp: new Date("2026-10-05T14:00:00Z"),
  createdAt: new Date("2026-10-05T14:03:00Z"),
  id: "4f67b69e-1325-4f99-bad9-a80fe69cce52",
};

describe("activity cursors", () => {
  it("round-trips through the URL", () => {
    const href = activityHref({ source: "manual", before: cursor });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseActivityFilters(params)).toEqual({
      source: "manual",
      before: cursor,
    });
  });

  it("ignores anything malformed", () => {
    expect(decodeActivityCursor("nope")).toBeNull();
    expect(
      decodeActivityCursor(encodeActivityCursor(cursor).replace(/.$/, "z")),
    ).toBeNull();
    expect(parseActivityFilters({ source: "robots" }).source).toBe("all");
  });

  it("keeps defaults out of the URL", () => {
    expect(activityHref({ source: "all" })).toBe("/activity");
    expect(activityHref({ source: "automatic" })).toBe(
      "/activity?source=automatic",
    );
  });
});

describe("groupByDay", () => {
  const now = new Date("2026-10-07T18:00:00Z");
  const at = (iso: string) => ({ date: new Date(iso) });

  it("labels today, yesterday and earlier days", () => {
    const groups = groupByDay(
      [
        at("2026-10-07T15:00:00Z"),
        at("2026-10-07T09:00:00Z"),
        at("2026-10-06T20:00:00Z"),
        at("2026-10-02T12:00:00Z"),
        at("2025-12-30T12:00:00Z"),
      ],
      (item) => item.date,
      { now, timeZone: "UTC" },
    );

    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Friday, October 2", 1],
      ["Tuesday, December 30, 2025", 1],
    ]);
  });

  it("uses the viewer's time zone", () => {
    // 02:00 UTC on the 7th is still the evening of the 6th in Toronto.
    const [group] = groupByDay(
      [at("2026-10-07T02:00:00Z")],
      (item) => item.date,
      { now, timeZone: "America/Toronto" },
    );
    expect(group!.label).toBe("Yesterday");
  });
});
