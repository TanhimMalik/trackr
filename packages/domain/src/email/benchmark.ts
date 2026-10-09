import {
  EMAIL_CLASSIFICATIONS,
  type ClassificationMethod,
  type EmailClassification,
} from "../enums";
import { normalizeCompanyName } from "../normalize/company";
import { normalizeJobTitle } from "../normalize/title";
import { classifyEmail } from "./classify";
import { CONFIDENCE_THRESHOLDS } from "./decide";
import { extractEmailDetails } from "./extract";
import { scoreRelevance } from "./relevance";
import type { EmailContent } from "./types";

/** What a person decided an email is. The ground truth for the benchmark. */
export type EmailLabel = {
  relevant: boolean;
  /** Set when relevant. UNKNOWN: job-related, but nothing to record. */
  classification: EmailClassification | null;
  companyName: string | null;
  jobTitle: string | null;
};

export type LabeledEmail = {
  id: string;
  email: EmailContent;
  label: EmailLabel;
};

/** What a classifier made of an email. */
export type EmailPrediction = {
  relevant: boolean;
  classification: EmailClassification;
  confidence: number;
  method: ClassificationMethod;
  companyName: string | null;
  jobTitle: string | null;
  /** For model calls: how long it took and what it cost. */
  latencyMs?: number;
  costUsd?: number;
};

/** The rules, as the pipeline runs them: relevance first, then classification. */
export function predictWithRules(email: EmailContent): EmailPrediction {
  const relevant = scoreRelevance(email).relevant;
  if (!relevant) {
    return {
      relevant,
      classification: "UNKNOWN",
      confidence: 0,
      method: "RULES",
      companyName: null,
      jobTitle: null,
    };
  }
  const rule = classifyEmail(email);
  const details = extractEmailDetails(email);
  return {
    relevant,
    classification: rule.classification,
    confidence: rule.confidence,
    method: "RULES",
    companyName: details.companyName,
    jobTitle: details.jobTitle,
  };
}

/**
 * A stable half-and-half split by message id. Rules and prompts are tuned on
 * `dev`; `test` is only measured, so its numbers aren't fitted to it.
 */
export function benchmarkSplit(id: string): "dev" | "test" {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 2 === 0 ? "dev" : "test";
}

type Counts = { tp: number; fp: number; fn: number };

export type ClassScore = {
  classification: EmailClassification;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  /** How many emails carry this label. */
  support: number;
};

export type BenchmarkReport = {
  emails: number;
  relevance: {
    precision: number | null;
    recall: number | null;
    accuracy: number;
    /** Job email the filter dropped. */
    missed: number;
    /** Unrelated email let through. */
    letThrough: number;
  };
  classification: {
    /** Over job-related emails: the right classification, or rightly none. */
    accuracy: number | null;
    macroF1: number | null;
    perClass: ClassScore[];
    /** Wrong classifications confident enough to be applied without asking. */
    confidentErrors: number;
    /** Job email left without a usable answer: what a fallback could take. */
    unclear: number;
  };
  extraction: {
    company: { correct: number; labeled: number; missing: number };
    jobTitle: { correct: number; labeled: number; missing: number };
  };
  cost: { totalUsd: number; meanLatencyMs: number | null };
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

const sameName = (
  normalize: (value: string) => string,
  expected: string,
  actual: string | null,
) => actual !== null && normalize(expected) === normalize(actual);

/**
 * Scores predictions against labels. Classification is measured over the
 * emails labeled job-related; one the filter dropped counts as UNKNOWN.
 */
export function scoreBenchmark(
  items: readonly LabeledEmail[],
  predictions: ReadonlyMap<string, EmailPrediction>,
): BenchmarkReport {
  const relevance = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const counts = new Map<EmailClassification, Counts>(
    EMAIL_CLASSIFICATIONS.map((kind) => [kind, { tp: 0, fp: 0, fn: 0 }]),
  );
  const support = new Map<EmailClassification, number>();
  let jobEmails = 0;
  let correct = 0;
  let confidentErrors = 0;
  let unclear = 0;
  const company = { correct: 0, labeled: 0, missing: 0 };
  const jobTitle = { correct: 0, labeled: 0, missing: 0 };
  let totalUsd = 0;
  const latencies: number[] = [];

  for (const { id, label } of items) {
    const prediction = predictions.get(id);
    if (!prediction) throw new Error(`No prediction for ${id}`);
    totalUsd += prediction.costUsd ?? 0;
    if (prediction.latencyMs !== undefined)
      latencies.push(prediction.latencyMs);

    if (label.relevant && prediction.relevant) relevance.tp++;
    else if (label.relevant) relevance.fn++;
    else if (prediction.relevant) relevance.fp++;
    else relevance.tn++;

    const predicted: EmailClassification = prediction.relevant
      ? prediction.classification
      : "UNKNOWN";
    const acted =
      prediction.relevant &&
      predicted !== "UNKNOWN" &&
      prediction.confidence >= CONFIDENCE_THRESHOLDS.flagged;
    const expected = label.relevant
      ? (label.classification ?? "UNKNOWN")
      : null;
    if (acted && predicted !== expected) confidentErrors++;
    if (!expected) continue;

    jobEmails++;
    support.set(expected, (support.get(expected) ?? 0) + 1);
    if (predicted === expected) {
      correct++;
      counts.get(predicted)!.tp++;
    } else {
      counts.get(predicted)!.fp++;
      counts.get(expected)!.fn++;
    }
    if (
      expected !== "UNKNOWN" &&
      (predicted === "UNKNOWN" ||
        prediction.confidence < CONFIDENCE_THRESHOLDS.review)
    ) {
      unclear++;
    }

    if (label.companyName) {
      company.labeled++;
      if (!prediction.companyName) company.missing++;
      else if (
        sameName(
          normalizeCompanyName,
          label.companyName,
          prediction.companyName,
        )
      )
        company.correct++;
    }
    if (label.jobTitle) {
      jobTitle.labeled++;
      if (!prediction.jobTitle) jobTitle.missing++;
      else if (sameName(normalizeJobTitle, label.jobTitle, prediction.jobTitle))
        jobTitle.correct++;
    }
  }

  const perClass: ClassScore[] = EMAIL_CLASSIFICATIONS.flatMap(
    (classification) => {
      const { tp, fp, fn } = counts.get(classification)!;
      if (tp + fp + fn === 0) return [];
      const precision = ratio(tp, tp + fp);
      const recall = ratio(tp, tp + fn);
      const f1 =
        precision !== null && recall !== null
          ? precision + recall === 0
            ? 0
            : (2 * precision * recall) / (precision + recall)
          : null;
      return [
        {
          classification,
          precision,
          recall,
          f1,
          support: support.get(classification) ?? 0,
        },
      ];
    },
  );
  const scored = perClass.filter((row) => row.support > 0 && row.f1 !== null);

  return {
    emails: items.length,
    relevance: {
      precision: ratio(relevance.tp, relevance.tp + relevance.fp),
      recall: ratio(relevance.tp, relevance.tp + relevance.fn),
      accuracy: ratio(relevance.tp + relevance.tn, items.length) ?? 0,
      missed: relevance.fn,
      letThrough: relevance.fp,
    },
    classification: {
      accuracy: ratio(correct, jobEmails),
      macroF1: ratio(
        scored.reduce((sum, row) => sum + row.f1!, 0),
        scored.length,
      ),
      perClass,
      confidentErrors,
      unclear,
    },
    extraction: { company, jobTitle },
    cost: {
      totalUsd,
      meanLatencyMs: ratio(
        latencies.reduce((sum, ms) => sum + ms, 0),
        latencies.length,
      ),
    },
  };
}

const pct = (value: number | null) =>
  value === null ? "–" : `${(value * 100).toFixed(1)}%`;

const share = (part: number, whole: number) =>
  `${part}/${whole} (${pct(ratio(part, whole))})`;

/** The report as Markdown, for the terminal and the README. */
export function formatBenchmarkReport(
  report: BenchmarkReport,
  title: string,
): string {
  const { relevance, classification, extraction, cost } = report;
  const lines = [
    `### ${title}`,
    "",
    `${report.emails} labeled emails.`,
    "",
    "| Measure | Result |",
    "| --- | --- |",
    `| Relevance precision | ${pct(relevance.precision)} |`,
    `| Relevance recall | ${pct(relevance.recall)} (${relevance.missed} job emails missed) |`,
    `| Classification accuracy (job email) | ${pct(classification.accuracy)} |`,
    `| Classification macro F1 | ${pct(classification.macroF1)} |`,
    `| Confident wrong updates | ${classification.confidentErrors} |`,
    `| Job email left unclear | ${classification.unclear} |`,
    `| Company extracted correctly | ${share(extraction.company.correct, extraction.company.labeled)} |`,
    `| Job title extracted correctly | ${share(extraction.jobTitle.correct, extraction.jobTitle.labeled)} |`,
  ];
  if (cost.totalUsd > 0 || cost.meanLatencyMs !== null) {
    lines.push(
      `| Model cost | $${cost.totalUsd.toFixed(4)} |`,
      `| Mean latency | ${cost.meanLatencyMs === null ? "–" : `${Math.round(cost.meanLatencyMs)} ms`} |`,
    );
  }
  lines.push(
    "",
    "| Classification | Precision | Recall | F1 | Labeled |",
    "| --- | --- | --- | --- | --- |",
    ...classification.perClass.map(
      (row) =>
        `| ${row.classification} | ${pct(row.precision)} | ${pct(row.recall)} | ${pct(row.f1)} | ${row.support} |`,
    ),
  );
  return lines.join("\n");
}
