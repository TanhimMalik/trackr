import {
  MAX_TRIAGE_POSTINGS,
  type FitResult,
  type TriageResponse,
  type TriageStatus,
} from "@trackr/domain";
import type { ReadJob } from "../reader/read-job";

/** One job posting open in the window, perhaps in more than one tab. */
export type TriageItem = {
  /** The posting's URL, which identifies it. */
  key: string;
  tabIds: number[];
  job: ReadJob;
  status: TriageStatus;
  fit: Pick<FitResult, "score" | "label" | "summary" | "gaps"> | null;
  /** Set when Trackr already tracks it, or once it's saved from here. */
  applicationId: string | null;
  saved: boolean;
  closed: boolean;
};

export type TriageRun = {
  at: string;
  windowId: number;
  items: TriageItem[];
  /** Tabs that aren't a posting Trackr can read. */
  unreadable: number;
  /** Postings past the per-request limit, left unchecked. */
  skipped: number;
};

export type OpenTab = { tabId: number; job: ReadJob | null };

/** Groups the tabs by posting, keeping the order they're open in. */
export function postingsFrom(tabs: OpenTab[]): {
  postings: { key: string; tabIds: number[]; job: ReadJob }[];
  unreadable: number;
  skipped: number;
} {
  const byKey = new Map<
    string,
    { key: string; tabIds: number[]; job: ReadJob }
  >();
  let unreadable = 0;
  for (const { tabId, job } of tabs) {
    if (!job) {
      unreadable++;
      continue;
    }
    const existing = byKey.get(job.url);
    if (existing) existing.tabIds.push(tabId);
    else byKey.set(job.url, { key: job.url, tabIds: [tabId], job });
  }
  const all = [...byKey.values()];
  return {
    postings: all.slice(0, MAX_TRIAGE_POSTINGS),
    unreadable,
    skipped: Math.max(0, all.length - MAX_TRIAGE_POSTINGS),
  };
}

/** The server's answers, matched back to the postings they're for. */
export function itemsFrom(
  postings: { key: string; tabIds: number[]; job: ReadJob }[],
  response: TriageResponse,
): TriageItem[] {
  const results = new Map(
    response.results.map((result) => [result.url, result]),
  );
  return postings.map(({ key, tabIds, job }) => {
    const result = results.get(job.url);
    return {
      key,
      tabIds,
      job,
      status: result?.status ?? "UNAVAILABLE",
      fit: result?.fit
        ? {
            score: result.fit.score,
            label: result.fit.label,
            summary: result.fit.summary,
            gaps: result.fit.gaps,
          }
        : null,
      applicationId: result?.trackedApplicationId ?? null,
      saved: false,
      closed: false,
    };
  });
}

// What to keep, save and close: shared with the web app's demo of triage.
export {
  isChoosable,
  keptByDefault,
  orderedByFit as ordered,
  toClose,
  toSave,
} from "@trackr/domain";
