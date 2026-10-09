/**
 * Scores the classifier against your labels and prints the report.
 *
 *   pnpm benchmark:run [--split test|dev|all] [--errors]
 *
 * `test` is the default: rules and prompts are tuned on `dev` only. The
 * report has counts and rates only. --errors also lists each mistake by
 * message id and sender domain (find it in the labeling page), never content.
 * A copy of the result is saved in `.benchmark/results/`.
 */
import { parseArgs } from "node:util";
import {
  benchmarkSplit,
  formatBenchmarkReport,
  predictWithRules,
  scoreBenchmark,
  senderDomain,
  type EmailPrediction,
  type LabeledEmail,
} from "@trackr/domain";
import { readLabels, readRecords, writeResult } from "./store";

const { values } = parseArgs({
  options: {
    split: { type: "string", default: "test" },
    errors: { type: "boolean", default: false },
  },
});
const split = values.split;
if (split !== "test" && split !== "dev" && split !== "all") {
  console.error("--split must be test, dev or all");
  process.exit(1);
}

const labels = readLabels();
const items: LabeledEmail[] = readRecords().flatMap((record) => {
  const label = labels[record.id];
  if (!label) return [];
  if (split !== "all" && benchmarkSplit(record.id) !== split) return [];
  return [{ id: record.id, email: record.email, label }];
});
if (items.length === 0) {
  console.error("No labeled emails in this split yet. Label some first.");
  process.exit(1);
}

const predictions = new Map<string, EmailPrediction>(
  items.map(({ id, email }) => [id, predictWithRules(email)]),
);
const report = scoreBenchmark(items, predictions);
console.log(formatBenchmarkReport(report, `Rules · ${split} split`));

const mistakes = items.flatMap(({ id, email, label }) => {
  const prediction = predictions.get(id)!;
  const expected = label.relevant
    ? (label.classification ?? "UNKNOWN")
    : "NOT_RELEVANT";
  const actual = prediction.relevant
    ? prediction.classification
    : "NOT_RELEVANT";
  return expected === actual
    ? []
    : [
        {
          id,
          sender: senderDomain(email.fromEmail),
          expected,
          actual,
          confidence: prediction.confidence,
        },
      ];
});
if (values.errors) {
  console.log(`\n${mistakes.length} mistakes:`);
  console.table(mistakes);
}

const path = writeResult(
  `rules-${split}-${new Date().toISOString().replaceAll(":", "-")}`,
  {
    classifier: "rules",
    split,
    report,
    mistakes,
  },
);
console.log(`\nSaved ${path}`);
process.exit(0);
