import { describe, expect, it } from "vitest";
import { cleanEmailBody, htmlToText } from "./body";
import { classifyEmail } from "./classify";
import { decideAutomation } from "./decide";
import { EMAIL_FIXTURES } from "./email.fixtures";
import { extractEmailDetails } from "./extract";
import { scoreRelevance } from "./relevance";

describe.each(EMAIL_FIXTURES)("$id", ({ email, expected }) => {
  it("is judged relevant or not from metadata alone", () => {
    expect(scoreRelevance(email).relevant).toBe(expected.relevant);
  });

  if (!expected.relevant) return;

  it("is classified correctly", () => {
    const result = classifyEmail(email);
    expect(result.classification).toBe(expected.classification);
    if (expected.confidence) {
      expect(result.confidence).toBeGreaterThanOrEqual(expected.confidence[0]);
      expect(result.confidence).toBeLessThanOrEqual(expected.confidence[1]);
    }
    if (expected.classification !== "UNKNOWN")
      expect(result.evidence).toBeTruthy();
  });

  it("yields the expected details", () => {
    const details = extractEmailDetails(email);
    for (const field of ["companyName", "jobTitle", "atsJobId"] as const) {
      if (expected[field] !== undefined) {
        expect(details[field]).toBe(expected[field]);
      }
    }
  });
});

describe("quality report", () => {
  it("summarizes precision and recall per classification", () => {
    const counts = new Map<string, { tp: number; fp: number; fn: number }>();
    const bump = (kind: string, key: "tp" | "fp" | "fn") => {
      const entry = counts.get(kind) ?? { tp: 0, fp: 0, fn: 0 };
      entry[key]++;
      counts.set(kind, entry);
    };
    let relevanceCorrect = 0;
    for (const { email, expected } of EMAIL_FIXTURES) {
      const relevant = scoreRelevance(email).relevant;
      if (relevant === expected.relevant) relevanceCorrect++;
      if (!relevant || !expected.classification) continue;
      const actual = classifyEmail(email).classification;
      if (actual === expected.classification) bump(actual, "tp");
      else {
        bump(actual, "fp");
        bump(expected.classification, "fn");
      }
    }

    // The domain package has no Node types; read the variable loosely.
    const env = (
      globalThis as { process?: { env: Record<string, string | undefined> } }
    ).process?.env;
    if (env?.REPORT) {
      const rows = [...counts].map(([kind, { tp, fp, fn }]) => ({
        classification: kind,
        precision: tp + fp ? (tp / (tp + fp)).toFixed(2) : "–",
        recall: tp + fn ? (tp / (tp + fn)).toFixed(2) : "–",
        examples: tp + fn,
      }));
      console.log(
        `Relevance: ${relevanceCorrect}/${EMAIL_FIXTURES.length} correct`,
      );
      console.table(rows);
    }
    expect(relevanceCorrect).toBe(EMAIL_FIXTURES.length);
  });
});

describe("body handling", () => {
  it("turns HTML into text and keeps the links", () => {
    const { text, links } = htmlToText(
      '<style>p{}</style><p>Hi&nbsp;Sam,</p><p>Take the <a href="https://www.hackerrank.com/test/1?a=1&amp;b=2">assessment</a>.</p>',
    );
    expect(cleanEmailBody(text)).toBe("Hi Sam,\nTake the assessment .");
    expect(links).toEqual(["https://www.hackerrank.com/test/1?a=1&b=2"]);
  });

  it("drops quoted replies and signatures", () => {
    const body = [
      "Sounds good, Tuesday works.",
      "",
      "-- ",
      "Sam",
      "On Mon, Oct 5, 2026 at 9:00 AM Priya <priya@fabrikam.example> wrote:",
      "> Unfortunately we need to move the interview.",
    ].join("\n");
    expect(cleanEmailBody(body)).toBe("Sounds good, Tuesday works.");
  });

  it("keeps bodies within the budget", () => {
    expect(cleanEmailBody("a".repeat(10_000))).toHaveLength(4000);
  });
});

describe("decideAutomation", () => {
  const base = {
    classification: "REJECTION" as const,
    confidence: 0.97,
    method: "RULES" as const,
    match: "AUTOMATIC" as const,
  };

  it("applies confident, clearly matched updates", () => {
    expect(decideAutomation(base)).toBe("AUTO_APPLY");
    expect(decideAutomation({ ...base, confidence: 0.9 })).toBe(
      "APPLY_FLAGGED",
    );
  });

  it("asks when the match or the classification is uncertain", () => {
    expect(decideAutomation({ ...base, match: "POSSIBLE" })).toBe(
      "NEEDS_REVIEW",
    );
    expect(decideAutomation({ ...base, confidence: 0.6 })).toBe("NEEDS_REVIEW");
    expect(decideAutomation({ ...base, confidence: 0.3 })).toBe("NO_UPDATE");
    expect(decideAutomation({ ...base, classification: "UNKNOWN" })).toBe(
      "NO_UPDATE",
    );
  });

  it("never lets the language model alone decide an offer or rejection", () => {
    expect(decideAutomation({ ...base, method: "LLM", confidence: 0.94 })).toBe(
      "NEEDS_REVIEW",
    );
  });

  it("follows the user's automation settings", () => {
    expect(
      decideAutomation(base, {
        autoUpdateEnabled: false,
        askBeforeMediumConfidence: false,
      }),
    ).toBe("NEEDS_REVIEW");
    expect(
      decideAutomation(
        { ...base, confidence: 0.9 },
        { autoUpdateEnabled: true, askBeforeMediumConfidence: true },
      ),
    ).toBe("NEEDS_REVIEW");
  });
});
