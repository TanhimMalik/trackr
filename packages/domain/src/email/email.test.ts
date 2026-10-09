import { describe, expect, it } from "vitest";
import {
  formatBenchmarkReport,
  predictWithRules,
  scoreBenchmark,
  type LabeledEmail,
} from "./benchmark";
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
  it("scores the rules over the corpus", () => {
    const items: LabeledEmail[] = EMAIL_FIXTURES.map(
      ({ id, email, expected }) => ({
        id,
        email,
        label: {
          relevant: expected.relevant,
          classification: expected.classification ?? null,
          companyName: expected.companyName ?? null,
          jobTitle: expected.jobTitle ?? null,
        },
      }),
    );
    const report = scoreBenchmark(
      items,
      new Map(items.map(({ id, email }) => [id, predictWithRules(email)])),
    );

    // The domain package has no Node types; read the variable loosely.
    const env = (
      globalThis as { process?: { env: Record<string, string | undefined> } }
    ).process?.env;
    if (env?.REPORT) {
      console.log(formatBenchmarkReport(report, "Rules on the fixture corpus"));
    }
    expect(report.relevance.accuracy).toBe(1);
    expect(report.classification.accuracy).toBe(1);
    expect(report.classification.confidentErrors).toBe(0);
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
