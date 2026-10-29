import { describe, expect, it } from "vitest";
import {
  keptByDefault,
  orderedByFit,
  toClose,
  toSave,
  type ChoosableItem,
} from "./choose";

const item = (
  key: string,
  score: number | null,
  fields: Partial<ChoosableItem> = {},
): ChoosableItem => ({
  key,
  status: score === null ? "NO_DESCRIPTION" : "SCORED",
  fit: score === null ? null : { score },
  applicationId: null,
  closed: false,
  ...fields,
});

const items = [
  item("stretch", 40),
  item("strong", 90),
  item("tracked", 80, { applicationId: "app-1" }),
  item("unscored", null),
  item("closed", 30, { closed: true }),
  item("possible", 60),
];

describe("choosing what to keep", () => {
  it("orders the best fits first and unscored postings last", () => {
    expect(orderedByFit(items).map((i) => i.key)).toEqual([
      "strong",
      "tracked",
      "possible",
      "stretch",
      "closed",
      "unscored",
    ]);
  });

  it("keeps strong fits, saves what's kept, and closes only scored postings let go", () => {
    const kept = keptByDefault(items);
    expect([...kept]).toEqual(["strong"]);
    expect(toSave(items, kept).map((i) => i.key)).toEqual(["strong"]);
    expect(toClose(items, kept).map((i) => i.key)).toEqual([
      "stretch",
      "possible",
    ]);
  });
});
