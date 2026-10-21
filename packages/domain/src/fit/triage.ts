import { z } from "zod";
import { sourcePlatformSchema } from "../enums";
import type { FitResult } from "./fit";
import { FIT_THRESHOLDS } from "./fit";

/** The most postings scored in one request: a full window of tabs. */
export const MAX_TRIAGE_POSTINGS = 30;

/** Shorter than this, a "description" is a page's blurb, not the posting. */
export const MIN_DESCRIPTION_LENGTH = 200;

/** Scores from here up are kept by default; the rest are offered for closing. */
export const TRIAGE_KEEP_SCORE = FIT_THRESHOLDS.STRONG;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

/** One open job posting, as the extension read it from a tab. */
export const triagePostingSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  companyName: text(200),
  jobTitle: text(200),
  location: optionalText(200),
  platform: sourcePlatformSchema.nullish().transform((value) => value ?? null),
  atsJobId: optionalText(200),
  description: optionalText(50_000),
});
export type TriagePosting = z.output<typeof triagePostingSchema>;

/** What the extension sends to score its open tabs. Shared by the extension and the API. */
export const triageRequestSchema = z.object({
  postings: z.array(triagePostingSchema).min(1).max(MAX_TRIAGE_POSTINGS),
});
export type TriageRequestPayload = z.input<typeof triageRequestSchema>;

/**
 * Why a posting has no score: too little text to judge, the day's scoring
 * allowance is used up, or the model didn't answer.
 */
export const TRIAGE_STATUSES = [
  "SCORED",
  "NO_DESCRIPTION",
  "LIMIT",
  "UNAVAILABLE",
] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export type TriageResult = {
  url: string;
  status: TriageStatus;
  fit: FitResult | null;
  /** The application this posting already is, when it's tracked. */
  trackedApplicationId: string | null;
};

export type TriageResponse = {
  /** Without a resume profile nothing can be scored. */
  hasProfile: boolean;
  results: TriageResult[];
};
