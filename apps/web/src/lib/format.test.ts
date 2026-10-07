import { describe, expect, it } from "vitest";
import { initials } from "./format";

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
