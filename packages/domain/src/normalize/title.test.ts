import { describe, expect, it } from "vitest";
import { normalizeJobTitle } from "./title";

describe("normalizeJobTitle", () => {
  it.each([
    ["Software Engineer", "software engineer"],
    ["Sr. Software Engineer II", "senior software engineer 2"],
    ["Software Engineer I", "software engineer 1"],
    ["SWE Intern", "software engineer intern"],
    ["Jr Developer", "junior developer"],
    ["Engineering Mgr", "engineering manager"],
  ])("expands abbreviations and levels: %s", (input, expected) => {
    expect(normalizeJobTitle(input)).toBe(expected);
  });

  it.each([
    ["Front-End Engineer", "frontend engineer"],
    ["Front End Engineer", "frontend engineer"],
    ["Backend Engineer", "backend engineer"],
    ["Full-Stack Developer", "fullstack developer"],
  ])("unifies spelling variants: %s", (input, expected) => {
    expect(normalizeJobTitle(input)).toBe(expected);
  });

  it("drops work-arrangement words but keeps team and specialty", () => {
    expect(normalizeJobTitle("Software Engineer - Remote")).toBe(
      "software engineer",
    );
    expect(normalizeJobTitle("Software Engineer (Backend)")).toBe(
      "software engineer backend",
    );
    expect(normalizeJobTitle("Software Engineer, Payments | Hybrid")).toBe(
      "software engineer payments",
    );
  });

  it("keeps language names that contain symbols", () => {
    expect(normalizeJobTitle("C++ Developer")).toBe("c++ developer");
    expect(normalizeJobTitle("C# / .NET Engineer")).toBe("c# net engineer");
  });
});
