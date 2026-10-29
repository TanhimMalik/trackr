import { TRIAGE_KEEP_SCORE } from "./limits";
import type { TriageStatus } from "./triage";

/** A triaged posting, as far as choosing what to keep needs to know. */
export type ChoosableItem = {
  key: string;
  status: TriageStatus;
  fit: { score: number } | null;
  /** Already in Trackr, or saved during this triage. */
  applicationId: string | null;
  closed: boolean;
};

/** Best fits first; postings without a score after them, in tab order. */
export const orderedByFit = <T extends ChoosableItem>(items: T[]): T[] =>
  [...items].sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1));

/** Can be kept or let go: scored, still open, and not already in Trackr. */
export const isChoosable = (item: ChoosableItem) =>
  item.status === "SCORED" && !item.applicationId && !item.closed;

/** Kept by default: the strong fits. */
export const keptByDefault = (items: ChoosableItem[]): Set<string> =>
  new Set(
    items
      .filter(
        (item) => isChoosable(item) && item.fit!.score >= TRIAGE_KEEP_SCORE,
      )
      .map((item) => item.key),
  );

/** What "Save" saves: the kept postings not yet in Trackr. */
export const toSave = <T extends ChoosableItem>(
  items: T[],
  kept: Set<string>,
) => items.filter((item) => isChoosable(item) && kept.has(item.key));

/**
 * What "Close" closes: scored postings the person didn't keep. Tabs Trackr
 * couldn't read or score, and postings already tracked, are never closed.
 */
export const toClose = <T extends ChoosableItem>(
  items: T[],
  kept: Set<string>,
) => items.filter((item) => isChoosable(item) && !kept.has(item.key));
