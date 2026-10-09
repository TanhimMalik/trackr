/**
 * Scores the classifier against your labels and prints the report.
 *
 *   pnpm benchmark:run [--split test|dev|all] [--classifier rules|hybrid] [--errors]
 *
 * `hybrid` is the pipeline with the model fallback: emails the rules can't
 * settle go to Claude (ANTHROPIC_API_KEY in apps/web/.env.local). Answers
 * are cached in `.benchmark/llm-cache.json` by model, prompt version and
 * message, so re-running costs nothing until the prompt changes; the report
 * still counts what the calls cost.
 *
 * `test` is the default: rules and prompts are tuned on `dev` only. The
 * report has counts and rates only. --errors also lists each mistake by
 * message id and sender domain (find it in the labeling page), never content.
 * A copy of the result is saved in `.benchmark/results/`.
 */
import { parseArgs } from "node:util";
import {
  benchmarkSplit,
  combineWithLlm,
  formatBenchmarkReport,
  LLM_PROMPT_VERSION,
  needsLlm,
  predictWithRules,
  scoreBenchmark,
  senderDomain,
  type EmailPrediction,
  type LabeledEmail,
} from "@trackr/domain";
import { emailLlmConfig } from "@/server/env";
import { emailLlm, type LlmResult } from "@/server/integrations/anthropic";
import {
  loadEnv,
  readCache,
  readLabels,
  readRecords,
  writeCache,
  writeResult,
} from "./store";

loadEnv();

const { values } = parseArgs({
  options: {
    split: { type: "string", default: "test" },
    errors: { type: "boolean", default: false },
    classifier: { type: "string", default: "rules" },
  },
});
const classifier = values.classifier;
if (classifier !== "rules" && classifier !== "hybrid") {
  console.error("--classifier must be rules or hybrid");
  process.exit(1);
}
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

let sentToModel = 0;
if (classifier === "hybrid") {
  const config = emailLlmConfig();
  if (!config) {
    console.error("Set ANTHROPIC_API_KEY in apps/web/.env.local first.");
    process.exit(1);
  }
  const classify = emailLlm(config);
  const cache = readCache<LlmResult>();
  const pending = items.filter(({ id }) => needsLlm(predictions.get(id)!));
  sentToModel = pending.length;
  let called = 0;
  // A few at a time, to stay well under the API's rate limits.
  for (let start = 0; start < pending.length; start += 4) {
    await Promise.all(
      pending.slice(start, start + 4).map(async ({ id, email }) => {
        const key = `${config.model}|${LLM_PROMPT_VERSION}|${id}`;
        let result = cache[key];
        if (!result) {
          result = await classify(email);
          cache[key] = result;
          called++;
        }
        predictions.set(id, {
          ...combineWithLlm(email, predictions.get(id)!, result.output),
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
        });
      }),
    );
    writeCache(cache);
  }
  console.log(
    `${sentToModel} of ${items.length} emails went to ${config.model} (${called} new calls, the rest cached).\n`,
  );
}

const report = scoreBenchmark(items, predictions);
console.log(
  formatBenchmarkReport(
    report,
    `${classifier === "hybrid" ? "Rules + model" : "Rules"} · ${split} split`,
  ),
);

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
  `${classifier}-${split}-${new Date().toISOString().replaceAll(":", "-")}`,
  {
    classifier,
    promptVersion: LLM_PROMPT_VERSION,
    sentToModel,
    split,
    report,
    mistakes,
  },
);
console.log(`\nSaved ${path}`);
process.exit(0);
