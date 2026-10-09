import { describe, expect, it } from "vitest";
import type { EmailPrediction } from "./benchmark";
import {
  combineWithLlm,
  evidenceFound,
  llmUserPrompt,
  needsLlm,
  type LlmOutput,
} from "./llm";
import type { EmailContent } from "./types";

const email: EmailContent = {
  fromName: "Contoso Careers",
  fromEmail: "careers@contoso.example",
  subject: "Your application to Contoso",
  snippet: "",
  labels: [],
  hasListUnsubscribe: false,
  body: "Hi Sam,\n\nThank you for your interest. We’ve decided to pursue other applicants whose experience is a closer fit.\n\nBest, Contoso",
  links: [],
  calendarStart: null,
};

const rules: EmailPrediction = {
  relevant: true,
  classification: "UNKNOWN",
  confidence: 0,
  method: "RULES",
  companyName: "Contoso",
  jobTitle: null,
};

const output = (fields: Partial<LlmOutput>): LlmOutput => ({
  isJobRelated: true,
  classification: "REJECTION",
  companyName: "Contoso Ltd",
  jobTitle: "Data Analyst",
  evidence:
    "We've decided to pursue other applicants whose experience is a closer fit.",
  confidence: 0.92,
  ...fields,
});

describe("needsLlm", () => {
  it("sends only relevant emails the rules can't settle", () => {
    expect(needsLlm(rules)).toBe(true);
    expect(
      needsLlm({ ...rules, classification: "REJECTION", confidence: 0.97 }),
    ).toBe(false);
    expect(
      needsLlm({ ...rules, classification: "REJECTION", confidence: 0.6 }),
    ).toBe(true);
    expect(needsLlm({ ...rules, relevant: false })).toBe(false);
  });
});

describe("evidenceFound", () => {
  it("matches quotes despite curly apostrophes, spacing and case", () => {
    expect(
      evidenceFound(email, "we've decided to pursue other  applicants"),
    ).toBe(true);
    expect(evidenceFound(email, "We are pleased to offer you the role")).toBe(
      false,
    );
    expect(evidenceFound(email, "Hi")).toBe(false);
  });
});

describe("combineWithLlm", () => {
  it("asks about a rejection only the model saw", () => {
    const result = combineWithLlm(email, rules, output({}));
    expect(result).toMatchObject({
      method: "LLM",
      classification: "REJECTION",
      evidenceVerified: true,
    });
    expect(result.confidence).toBeLessThan(0.75);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("prefers the rules' names and fills gaps from the model", () => {
    const result = combineWithLlm(email, rules, output({}));
    expect(result.companyName).toBe("Contoso");
    expect(result.jobTitle).toBe("Data Analyst");
  });

  it("keeps model-only answers below the automatic band", () => {
    const result = combineWithLlm(
      email,
      rules,
      output({
        classification: "APPLICATION_CONFIRMATION",
        evidence: "Thank you for your interest.",
        confidence: 0.99,
      }),
    );
    expect(result.confidence).toBe(0.94);
  });

  it("drops an answer whose quote isn't in the email to the review floor", () => {
    const result = combineWithLlm(
      email,
      rules,
      output({
        classification: "INTERVIEW_REQUEST",
        evidence: "Please pick a time for your interview.",
      }),
    );
    expect(result.confidence).toBe(0.5);
    expect(result.evidence).toBeNull();
  });

  it("lets the model clear an email that isn't about an application", () => {
    const result = combineWithLlm(
      email,
      rules,
      output({ isJobRelated: false, classification: "UNKNOWN" }),
    );
    expect(result).toMatchObject({ relevant: false, confidence: 0 });
  });
});

describe("llmUserPrompt", () => {
  it("sends the headers and body, nothing else", () => {
    const prompt = llmUserPrompt(email);
    expect(prompt).toContain("From: Contoso Careers <careers@contoso.example>");
    expect(prompt).toContain("Subject: Your application to Contoso");
    expect(prompt.startsWith("<email>")).toBe(true);
  });
});
