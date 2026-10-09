import { describe, expect, it } from "vitest";
import {
  matchApplication,
  sameCompanyLongerName,
  scoreCandidate,
  titleSimilarity,
  type IncomingSignal,
  type MatchCandidate,
} from "./matching";
import { normalizeCompanyName } from "./normalize/company";
import { normalizeJobTitle } from "./normalize/title";

const now = new Date("2026-10-08T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const signal = (fields: Partial<IncomingSignal> = {}): IncomingSignal => ({
  companyNameNorm: normalizeCompanyName("Stripe, Inc."),
  jobTitleNorm: normalizeJobTitle("Software Engineer"),
  platform: "GREENHOUSE",
  occurredAt: now,
  ...fields,
});

const candidate = (
  id: string,
  fields: Partial<MatchCandidate> & { title?: string } = {},
): MatchCandidate => ({
  id,
  companyNameNorm: normalizeCompanyName("Stripe"),
  companyDomain: "stripe.com",
  jobTitleNorm: normalizeJobTitle(fields.title ?? "Software Engineer"),
  sourcePlatform: "OTHER",
  atsJobId: null,
  activeAt: daysAgo(3),
  ...fields,
});

describe("titleSimilarity", () => {
  it("compares the words two titles share", () => {
    expect(titleSimilarity("software engineer", "software engineer")).toBe(1);
    expect(
      titleSimilarity("senior software engineer", "software engineer"),
    ).toBeCloseTo(2 / 3);
    expect(titleSimilarity("product designer", "software engineer")).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("explains its score", () => {
    expect(scoreCandidate(signal(), candidate("a"))).toEqual({
      candidateId: "a",
      score: 80,
      signals: ["COMPANY_NAME", "TITLE_EXACT", "RECENT"],
    });
  });

  it("counts against a clearly different role at the same company", () => {
    const scored = scoreCandidate(
      signal(),
      candidate("a", { title: "Product Designer" }),
    );
    expect(scored.signals).toContain("DIFFERENT_TITLE");
    expect(scored.score).toBe(40 - 30 + 10);
  });
});

describe("sameCompanyLongerName", () => {
  it("matches a name that continues with whole words", () => {
    expect(sameCompanyLongerName("calibrate", "calibrate health")).toBe(true);
    expect(sameCompanyLongerName("amazon web services", "amazon")).toBe(true);
    expect(sameCompanyLongerName("meta", "metaview")).toBe(false);
    expect(sameCompanyLongerName("stripe", "stripe")).toBe(false);
  });
});

describe("placeholder titles", () => {
  it("treat a role nobody has named as unknown, not different", () => {
    const scored = scoreCandidate(
      signal(),
      candidate("a", { title: "Role not specified" }),
    );
    expect(scored.signals).toEqual(["COMPANY_NAME", "RECENT"]);
  });
});

describe("matchApplication", () => {
  it("matches the same role at the same company automatically", () => {
    expect(matchApplication(signal(), [candidate("a")])).toMatchObject({
      decision: "AUTOMATIC",
      best: { candidateId: "a" },
    });
  });

  it("treats the same ATS job posting as decisive", () => {
    const result = matchApplication(
      signal({ atsJobId: "123", jobTitleNorm: "something else entirely" }),
      [
        candidate("a"),
        candidate("b", {
          sourcePlatform: "GREENHOUSE",
          atsJobId: "123",
          activeAt: daysAgo(90),
          title: "Backend Engineer",
        }),
      ],
    );
    expect(result).toMatchObject({
      decision: "AUTOMATIC",
      best: { candidateId: "b" },
    });
  });

  it("asks about a similar role", () => {
    expect(
      matchApplication(signal(), [
        candidate("a", { title: "Senior Software Engineer" }),
      ]).decision,
    ).toBe("POSSIBLE");
  });

  it("asks rather than guessing between two equally good matches", () => {
    expect(
      matchApplication(signal(), [candidate("a"), candidate("b")]).decision,
    ).toBe("POSSIBLE");
  });

  it("leaves other companies and other roles alone", () => {
    expect(
      matchApplication(signal(), [
        candidate("a", {
          companyNameNorm: "figma",
          companyDomain: "figma.com",
        }),
        candidate("b", { title: "Product Designer" }),
      ]).decision,
    ).toBe("NONE");
    expect(matchApplication(signal(), [])).toEqual({
      decision: "NONE",
      best: null,
    });
  });

  it("needs recent activity for an automatic match", () => {
    expect(
      matchApplication(signal(), [candidate("a", { activeAt: daysAgo(120) })])
        .decision,
    ).toBe("POSSIBLE");
  });
});
