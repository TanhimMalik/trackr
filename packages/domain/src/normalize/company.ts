import { foldText, tokenize } from "./text";

const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "ag",
  "sa",
  "sas",
  "srl",
  "bv",
  "nv",
  "pty",
  "pte",
  "oy",
  "ab",
  "lp",
  "llp",
  "ulc",
]);

// Phrases that ATS senders append to a company's name, e.g. "Datadog Hiring Team".
// Longer phrases come first so they are removed whole.
const DISPLAY_SUFFIXES = [
  ["talent", "acquisition", "team"],
  ["talent", "acquisition"],
  ["hiring", "team"],
  ["recruiting", "team"],
  ["recruitment", "team"],
  ["talent", "team"],
  ["people", "team"],
  ["recruiting"],
  ["recruitment"],
  ["careers"],
  ["jobs"],
];

// "Monday.com", "Character.ai": a web suffix written as part of the name.
const WEB_SUFFIX = /\.(com|io|ai|co|so|app|dev|net|org)$/;

function endsWith(tokens: string[], suffix: string[]): boolean {
  if (tokens.length <= suffix.length) return false;
  return suffix.every(
    (part, index) => tokens[tokens.length - suffix.length + index] === part,
  );
}

/**
 * Canonical form of a company name for matching and deduplication:
 * "Datadog, Inc." and "Datadog Hiring Team" both become "datadog".
 * The original name is kept for display.
 */
export function normalizeCompanyName(name: string): string {
  const folded = foldText(name)
    .trim()
    .replace(WEB_SUFFIX, "")
    .replace(/['’]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ");

  let tokens = tokenize(folded);
  if (tokens[0] === "the" && tokens.length > 1) tokens = tokens.slice(1);

  // Strip trailing display and legal suffixes, but never the whole name.
  let changed = true;
  while (changed) {
    changed = false;
    const suffix = DISPLAY_SUFFIXES.find((phrase) => endsWith(tokens, phrase));
    if (suffix) {
      tokens = tokens.slice(0, -suffix.length);
      changed = true;
    } else if (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens.at(-1)!)) {
      tokens = tokens.slice(0, -1);
      changed = true;
    }
  }

  return tokens.join(" ");
}
