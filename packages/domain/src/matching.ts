import type { SourcePlatform } from "./enums";
import { normalizeJobTitle } from "./normalize/title";
import { tokenize } from "./normalize/text";

/**
 * The title of an application created before anything named the role. It
 * means "unknown", so it never counts as the same or a different role.
 */
export const PLACEHOLDER_JOB_TITLE = "Role not specified";
const PLACEHOLDER_NORM = normalizeJobTitle(PLACEHOLDER_JOB_TITLE);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Points each signal contributes. One place, so tuning is a one-line change. */
export const MATCH_WEIGHTS = {
  ATS_JOB_ID: 50,
  SAME_THREAD: 60,
  COMPANY_NAME: 40,
  COMPANY_NAME_PARTIAL: 30,
  COMPANY_DOMAIN: 30,
  TITLE_EXACT: 30,
  TITLE_SIMILAR: 20,
  RECENT: 10,
  SENDER_DOMAIN: 10,
  DIFFERENT_TITLE: -30,
} as const;

export type MatchSignal = keyof typeof MATCH_WEIGHTS;

export const MATCH_SIGNAL_LABELS: Record<MatchSignal, string> = {
  ATS_JOB_ID: "Same job posting",
  SAME_THREAD: "Same email thread",
  COMPANY_NAME: "Same company",
  COMPANY_NAME_PARTIAL: "Same company, longer name",
  COMPANY_DOMAIN: "Same company website",
  TITLE_EXACT: "Same role",
  TITLE_SIMILAR: "Similar role",
  RECENT: "Active in the last 30 days",
  SENDER_DOMAIN: "Sent from the company's domain",
  DIFFERENT_TITLE: "Different role",
};

export const MATCH_THRESHOLDS = { automatic: 80, possible: 50 } as const;
/** Two automatic-looking candidates closer than this are too close to call. */
const TIE_MARGIN = 10;
const SIMILAR_TITLE = 0.5;
const DIFFERENT_TITLE = 0.34;
const RECENT_DAYS = 30;

/** Something that may belong to an existing application: a submission or an email. */
export type IncomingSignal = {
  companyNameNorm: string;
  companyDomain?: string | null;
  jobTitleNorm?: string | null;
  platform?: SourcePlatform | null;
  atsJobId?: string | null;
  threadId?: string | null;
  senderDomain?: string | null;
  occurredAt: Date;
};

export type MatchCandidate = {
  id: string;
  companyNameNorm: string;
  companyDomain: string | null;
  jobTitleNorm: string;
  sourcePlatform: SourcePlatform;
  atsJobId: string | null;
  /** When it was applied to, or else last active. */
  activeAt: Date;
  threadIds?: readonly string[];
};

export type ScoredCandidate = {
  candidateId: string;
  score: number;
  signals: MatchSignal[];
};

export type MatchResult =
  | { decision: "NONE"; best: ScoredCandidate | null }
  | { decision: "POSSIBLE" | "AUTOMATIC"; best: ScoredCandidate };

/** Share of words two normalized titles have in common, from 0 to 1. */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

function sameAtsJob(signal: IncomingSignal, candidate: MatchCandidate) {
  return Boolean(
    signal.atsJobId &&
    candidate.atsJobId === signal.atsJobId &&
    candidate.sourcePlatform === signal.platform,
  );
}

/**
 * "Calibrate" and "Calibrate Health": one name is the other's leading
 * words. Whole words only, so "Meta" never matches "Metaview".
 */
export function sameCompanyLongerName(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(`${short} `);
}

/** How strongly a signal points at one application, and why. */
export function scoreCandidate(
  signal: IncomingSignal,
  candidate: MatchCandidate,
): ScoredCandidate {
  const signals: MatchSignal[] = [];

  if (sameAtsJob(signal, candidate)) signals.push("ATS_JOB_ID");
  if (signal.threadId && candidate.threadIds?.includes(signal.threadId)) {
    signals.push("SAME_THREAD");
  }
  if (signal.companyNameNorm === candidate.companyNameNorm) {
    signals.push("COMPANY_NAME");
  } else if (
    sameCompanyLongerName(signal.companyNameNorm, candidate.companyNameNorm)
  ) {
    signals.push("COMPANY_NAME_PARTIAL");
  }
  if (
    signal.companyDomain &&
    signal.companyDomain === candidate.companyDomain
  ) {
    signals.push("COMPANY_DOMAIN");
  }
  if (
    signal.jobTitleNorm &&
    candidate.jobTitleNorm &&
    candidate.jobTitleNorm !== PLACEHOLDER_NORM
  ) {
    const similarity = titleSimilarity(
      signal.jobTitleNorm,
      candidate.jobTitleNorm,
    );
    if (signal.jobTitleNorm === candidate.jobTitleNorm) {
      signals.push("TITLE_EXACT");
    } else if (similarity >= SIMILAR_TITLE) {
      signals.push("TITLE_SIMILAR");
    } else if (similarity < DIFFERENT_TITLE) {
      signals.push("DIFFERENT_TITLE");
    }
  }
  if (
    Math.abs(signal.occurredAt.getTime() - candidate.activeAt.getTime()) <=
    RECENT_DAYS * DAY_MS
  ) {
    signals.push("RECENT");
  }
  if (signal.senderDomain && signal.senderDomain === candidate.companyDomain) {
    signals.push("SENDER_DOMAIN");
  }

  const score = signals.reduce((sum, name) => sum + MATCH_WEIGHTS[name], 0);
  return { candidateId: candidate.id, score, signals };
}

/**
 * Finds the application a signal belongs to. The same ATS job posting is
 * decisive. Otherwise 80 points is an automatic match and 50 a possible one,
 * and two near-equal automatic candidates are only ever a possible match:
 * Trackr never guesses between two roles.
 */
export function matchApplication(
  signal: IncomingSignal,
  candidates: readonly MatchCandidate[],
  thresholds: { automatic: number; possible: number } = MATCH_THRESHOLDS,
): MatchResult {
  const decisive = candidates.find((candidate) =>
    sameAtsJob(signal, candidate),
  );
  if (decisive) {
    return { decision: "AUTOMATIC", best: scoreCandidate(signal, decisive) };
  }

  const ranked = candidates
    .map((candidate) => scoreCandidate(signal, candidate))
    .sort((a, b) => b.score - a.score);
  const [best, runnerUp] = ranked;
  if (!best || best.score < thresholds.possible) {
    return { decision: "NONE", best: best ?? null };
  }
  if (best.score < thresholds.automatic) return { decision: "POSSIBLE", best };
  if (
    runnerUp &&
    runnerUp.score >= thresholds.automatic &&
    best.score - runnerUp.score < TIE_MARGIN
  ) {
    return { decision: "POSSIBLE", best };
  }
  return { decision: "AUTOMATIC", best };
}
