// Numbers shared with the extension, kept apart from the schemas so the
// extension's bundles don't carry the validation library.

/** Scores at or above these earn the label. */
export const FIT_THRESHOLDS = { STRONG: 75, POSSIBLE: 55 } as const;

/** The most postings scored in one request: a full window of tabs. */
export const MAX_TRIAGE_POSTINGS = 30;

/** Shorter than this, a "description" is a page's blurb, not the posting. */
export const MIN_DESCRIPTION_LENGTH = 200;

/** Scores from here up are kept by default; the rest are offered for closing. */
export const TRIAGE_KEEP_SCORE = FIT_THRESHOLDS.STRONG;
