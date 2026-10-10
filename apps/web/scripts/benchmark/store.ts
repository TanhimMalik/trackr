/**
 * The local benchmark's files, in `.benchmark/` at the repository root. It
 * holds real email, so it is gitignored, readable only by its owner, and
 * never leaves this machine. Delete it with `rm -rf .benchmark`.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import type { EmailLabel } from "@trackr/domain";
import type { BenchmarkRecord } from "@/server/services/email-benchmark";

// BENCHMARK_DIR points the scripts elsewhere, such as at fictional email.
export const BENCHMARK_DIR = process.env.BENCHMARK_DIR
  ? `${process.env.BENCHMARK_DIR.replace(/\/$/, "")}/`
  : fileURLToPath(new URL("../../../../.benchmark/", import.meta.url));
const EMAILS = `${BENCHMARK_DIR}emails.jsonl`;
const LABELS = `${BENCHMARK_DIR}labels.json`;

export type StoredLabel = EmailLabel & { labeledAt: string; notes?: string };

function ensureBenchmarkDir() {
  mkdirSync(BENCHMARK_DIR, { recursive: true, mode: 0o700 });
}

export function readRecords(): BenchmarkRecord[] {
  if (!existsSync(EMAILS)) return [];
  return readFileSync(EMAILS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BenchmarkRecord);
}

export function appendRecord(record: BenchmarkRecord) {
  ensureBenchmarkDir();
  appendFileSync(EMAILS, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

export function readLabels(): Record<string, StoredLabel> {
  if (!existsSync(LABELS)) return {};
  return JSON.parse(readFileSync(LABELS, "utf8")) as Record<
    string,
    StoredLabel
  >;
}

export function writeLabels(labels: Record<string, StoredLabel>) {
  ensureBenchmarkDir();
  writeFileSync(LABELS, JSON.stringify(labels, null, 2), { mode: 0o600 });
}

const CACHE = `${BENCHMARK_DIR}llm-cache.json`;

/** The model's answers, by model, prompt version and message id. */
export function readCache<T>(): Record<string, T> {
  if (!existsSync(CACHE)) return {};
  return JSON.parse(readFileSync(CACHE, "utf8")) as Record<string, T>;
}

export function writeCache(cache: Record<string, unknown>) {
  ensureBenchmarkDir();
  writeFileSync(CACHE, JSON.stringify(cache), { mode: 0o600 });
}

export function writeResult(name: string, data: unknown): string {
  const dir = `${BENCHMARK_DIR}results/`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = `${dir}${name}.json`;
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  return path;
}

export function loadEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Fall back to the process environment.
  }
}
