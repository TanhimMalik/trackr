import { describe, expect, it } from "vitest";
import {
  computeFit,
  fitLabelFor,
  fitPostingText,
  fitUserPrompt,
  quoteFound,
  type FitOutput,
} from "./fit";
import { DEFAULT_FIT_PREFERENCES, tidyResumeProfile } from "./profile";

const POSTING = {
  companyName: "Northwind Labs",
  jobTitle: "Backend Engineer",
  location: "Remote, Canada",
  description:
    "You'll build payment APIs in TypeScript and Postgres.\nRequirements: 2+ years of backend experience. Experience with Kafka is a plus.\nWe're a fintech company.",
};
const text = fitPostingText(POSTING);

const criterion = (fields: Partial<FitOutput["skills"]> = {}) => ({
  rating: "FULL" as const,
  stated: true,
  evidence: null,
  reason: "Reason.",
  ...fields,
});

const output = (fields: Partial<FitOutput> = {}): FitOutput => ({
  skills: criterion({
    rating: "STRONG",
    evidence: "payment APIs in TypeScript and Postgres",
  }),
  seniority: criterion({ evidence: "2+ years of backend experience" }),
  domain: criterion({ evidence: "We're a fintech company" }),
  practical: criterion({ evidence: "Remote, Canada" }),
  gaps: ["Kafka"],
  summary: "A good match.",
  ...fields,
});

describe("computeFit", () => {
  it("weights the four ratings into a score out of 100", () => {
    const fit = computeFit(output(), text);
    expect(fit.criteria.map((c) => [c.key, c.points, c.max])).toEqual([
      ["skills", 30, 40],
      ["seniority", 25, 25],
      ["domain", 20, 20],
      ["practical", 15, 15],
    ]);
    expect(fit.score).toBe(90);
    expect(fit.label).toBe("STRONG");
    expect(fit.gaps).toEqual(["Kafka"]);
  });

  it("scores what the posting doesn't say low instead of guessing", () => {
    const fit = computeFit(
      output({ practical: criterion({ stated: false }) }),
      text,
    );
    const practical = fit.criteria.find((c) => c.key === "practical")!;
    expect(practical).toMatchObject({ rating: "WEAK", points: 4 });
  });

  it("holds a rating it can't back with the posting's words to the middle", () => {
    const fit = computeFit(
      output({
        seniority: criterion({ evidence: "5+ years leading teams" }),
        domain: criterion({ evidence: null }),
      }),
      text,
    );
    expect(fit.criteria.find((c) => c.key === "seniority")).toMatchObject({
      rating: "PARTIAL",
      points: 13,
      evidence: null,
    });
    expect(fit.criteria.find((c) => c.key === "domain")).toMatchObject({
      rating: "PARTIAL",
      points: 10,
    });
  });

  it("never raises a low rating", () => {
    const fit = computeFit(
      output({ skills: criterion({ rating: "NONE", stated: false }) }),
      text,
    );
    expect(fit.criteria[0]).toMatchObject({ rating: "NONE", points: 0 });
  });

  it("keeps at most five short gaps", () => {
    const fit = computeFit(
      output({ gaps: ["a", "", "b", "c", "d", "e", "f"] }),
      text,
    );
    expect(fit.gaps).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("quoteFound", () => {
  it("matches across case, quotes and spacing", () => {
    expect(quoteFound(text, "we’re a  FINTECH company.")).toBe(true);
    expect(quoteFound(text, "We're a bank")).toBe(false);
    expect(quoteFound(text, "API")).toBe(false);
  });
});

describe("fitLabelFor", () => {
  it("labels by threshold", () => {
    expect(fitLabelFor(75)).toBe("STRONG");
    expect(fitLabelFor(74)).toBe("POSSIBLE");
    expect(fitLabelFor(55)).toBe("POSSIBLE");
    expect(fitLabelFor(54)).toBe("STRETCH");
  });
});

describe("tidyResumeProfile", () => {
  it("drops blanks and repeats, and keeps values in range", () => {
    const profile = tidyResumeProfile({
      headline: "  Junior engineer ",
      seniority: "ENTRY",
      yearsExperience: -2,
      skills: [
        { name: "TypeScript", evidence: "WORK", detail: "Intern" },
        { name: "typescript", evidence: "COURSE", detail: "Class" },
        { name: " ", evidence: "PROJECT", detail: "" },
      ],
      domains: ["fintech", "fintech", ""],
      education: null,
    });
    expect(profile).toEqual({
      headline: "Junior engineer",
      seniority: "ENTRY",
      yearsExperience: 0,
      skills: [{ name: "TypeScript", evidence: "WORK", detail: "Intern" }],
      domains: ["fintech"],
      education: null,
    });
  });
});

describe("fitUserPrompt", () => {
  it("shows the profile, preferences and posting, and nothing else", () => {
    const prompt = fitUserPrompt(
      {
        headline: "Junior engineer",
        seniority: "ENTRY",
        yearsExperience: 1,
        skills: [{ name: "Postgres", evidence: "WORK", detail: "Intern" }],
        domains: ["fintech"],
        education: null,
      },
      DEFAULT_FIT_PREFERENCES,
      POSTING,
    );
    expect(prompt).toContain("- Postgres (work: Intern)");
    expect(prompt).toContain("- Minimum salary: not set");
    expect(prompt).toContain("Role: Backend Engineer");
    expect(prompt).toContain("We're a fintech company.");
  });
});
