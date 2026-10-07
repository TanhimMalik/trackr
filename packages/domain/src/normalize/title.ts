import { foldText, tokenize } from "./text";

const PHRASES: [RegExp, string][] = [
  [/\bfront[\s-]?end\b/g, "frontend"],
  [/\bback[\s-]?end\b/g, "backend"],
  [/\bfull[\s-]?stack\b/g, "fullstack"],
];

const TOKEN_REPLACEMENTS: Record<string, string[]> = {
  sr: ["senior"],
  snr: ["senior"],
  jr: ["junior"],
  swe: ["software", "engineer"],
  sde: ["software", "engineer"],
  eng: ["engineer"],
  engr: ["engineer"],
  mgr: ["manager"],
  dev: ["developer"],
  ml: ["machine", "learning"],
  // Levels: "Software Engineer II" and "Software Engineer 2" are the same title.
  i: ["1"],
  ii: ["2"],
  iii: ["3"],
  iv: ["4"],
  v: ["5"],
};

// Work-arrangement words carry no information about the role itself.
const DROPPED_TOKENS = new Set(["remote", "hybrid"]);

/**
 * Canonical form of a job title for matching:
 * "Sr. Software Engineer II - Remote" becomes "senior software engineer 2".
 * Team and specialty words are kept, because they distinguish different roles.
 */
export function normalizeJobTitle(title: string): string {
  let value = foldText(title).replace(/&/g, " and ");
  for (const [pattern, replacement] of PHRASES) {
    value = value.replace(pattern, replacement);
  }
  // Keep + and # so "C++" and "C#" survive.
  value = value.replace(/[^a-z0-9+#]+/g, " ");

  return tokenize(value)
    .flatMap((token) => TOKEN_REPLACEMENTS[token] ?? [token])
    .filter((token) => !DROPPED_TOKENS.has(token))
    .join(" ");
}
