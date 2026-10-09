import { describe, expect, it } from "vitest";
import {
  benchmarkSplit,
  formatBenchmarkReport,
  scoreBenchmark,
  type EmailLabel,
  type EmailPrediction,
  type LabeledEmail,
} from "./benchmark";
import type { EmailContent } from "./types";

const email = {
  fromName: null,
  fromEmail: "no-reply@example.com",
  subject: "",
  snippet: "",
  labels: [],
  hasListUnsubscribe: false,
  body: "",
  links: [],
  calendarStart: null,
} satisfies EmailContent;

const label = (fields: Partial<EmailLabel>): EmailLabel => ({
  relevant: true,
  classification: "REJECTION",
  companyName: null,
  jobTitle: null,
  ...fields,
});

const prediction = (fields: Partial<EmailPrediction>): EmailPrediction => ({
  relevant: true,
  classification: "REJECTION",
  confidence: 0.97,
  method: "RULES",
  companyName: null,
  jobTitle: null,
  ...fields,
});

function score(rows: [EmailLabel, EmailPrediction][]) {
  const items: LabeledEmail[] = rows.map(([l], i) => ({
    id: String(i),
    email,
    label: l,
  }));
  return scoreBenchmark(items, new Map(rows.map(([, p], i) => [String(i), p])));
}

describe("scoreBenchmark", () => {
  it("measures the relevance filter", () => {
    const report = score([
      [label({}), prediction({})],
      [label({}), prediction({ relevant: false })],
      [label({ relevant: false, classification: null }), prediction({})],
      [
        label({ relevant: false, classification: null }),
        prediction({ relevant: false }),
      ],
    ]);
    expect(report.relevance).toMatchObject({
      precision: 0.5,
      recall: 0.5,
      accuracy: 0.5,
      missed: 1,
      letThrough: 1,
    });
  });

  it("counts a dropped job email as unclear and wrong", () => {
    const report = score([
      [label({}), prediction({})],
      [
        label({ classification: "ASSESSMENT" }),
        prediction({ relevant: false }),
      ],
    ]);
    expect(report.classification.accuracy).toBe(0.5);
    expect(report.classification.unclear).toBe(1);
    const assessment = report.classification.perClass.find(
      (row) => row.classification === "ASSESSMENT",
    );
    expect(assessment).toMatchObject({ recall: 0, support: 1 });
  });

  it("flags confident mistakes, not cautious ones", () => {
    const report = score([
      [label({ classification: "OFFER" }), prediction({})],
      [label({ classification: "OFFER" }), prediction({ confidence: 0.6 })],
      [label({ relevant: false, classification: null }), prediction({})],
    ]);
    expect(report.classification.confidentErrors).toBe(2);
  });

  it("compares extracted names after normalizing them", () => {
    const report = score([
      [
        label({ companyName: "Acme, Inc.", jobTitle: "Software Engineer" }),
        prediction({ companyName: "Acme", jobTitle: "software engineer" }),
      ],
      [label({ companyName: "Globex" }), prediction({})],
    ]);
    expect(report.extraction.company).toEqual({
      correct: 1,
      labeled: 2,
      missing: 1,
    });
    expect(report.extraction.jobTitle.correct).toBe(1);
  });

  it("adds up model cost and latency", () => {
    const report = score([
      [label({}), prediction({ costUsd: 0.001, latencyMs: 400 })],
      [label({}), prediction({ costUsd: 0.002, latencyMs: 600 })],
    ]);
    expect(report.cost.totalUsd).toBeCloseTo(0.003);
    expect(report.cost.meanLatencyMs).toBe(500);
    expect(formatBenchmarkReport(report, "Test")).toContain("Mean latency");
  });
});

describe("benchmarkSplit", () => {
  it("is stable and splits roughly in half", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `msg-${i}`);
    expect(benchmarkSplit("msg-1")).toBe(benchmarkSplit("msg-1"));
    const dev = ids.filter((id) => benchmarkSplit(id) === "dev").length;
    expect(dev).toBeGreaterThan(400);
    expect(dev).toBeLessThan(600);
  });
});
