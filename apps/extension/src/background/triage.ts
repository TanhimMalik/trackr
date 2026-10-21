import type { TriageResponse } from "@trackr/domain";
import { TRACKR_URL } from "../shared/config";
import { buildSubmission } from "../shared/submission";
import {
  itemsFrom,
  postingsFrom,
  type OpenTab,
  type TriageRun,
} from "../shared/triage";
import type { ReadJob } from "../reader/read-job";
import type { TrackResult, TriageOutcome } from "../shared/types";
import { apiFetch, getAuth } from "./auth";

const KEY = "triage";
// A triage is shown again when the popup reopens, for this long.
const KEEP_MS = 60 * 60 * 1000;

async function saveRun(run: TriageRun): Promise<void> {
  await chrome.storage.session.set({ [KEY]: run });
}

/** The window's last triage, while it's recent. */
export async function lastRun(windowId: number): Promise<TriageRun | null> {
  const run = (await chrome.storage.session.get(KEY))[KEY] as
    TriageRun | undefined;
  if (!run || run.windowId !== windowId) return null;
  return Date.now() - new Date(run.at).getTime() < KEEP_MS ? run : null;
}

/** Reads one tab with the reader script; null when it isn't a posting or can't be read. */
async function readTab(tabId: number): Promise<ReadJob | null> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["reader.js"],
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () =>
        (
          globalThis as { __trackrReadJob?: () => unknown }
        ).__trackrReadJob?.() ?? null,
    });
    return (result?.result as ReadJob | null) ?? null;
  } catch {
    // Browser pages, the web store, and tabs Chrome put to sleep.
    return null;
  }
}

const ERRORS: Record<number, string> = {
  403: "Triage needs a Trackr account. Demo workspaces can try it on the Integrations page.",
  429: "That's a lot of triaging. Try again in a minute.",
  503: "Fit scoring isn't set up on this Trackr site.",
};

/**
 * Reads the job postings open in a window and scores them against the
 * resume profile. Only tabs in that window are read, and only now.
 */
export async function runTriage(windowId: number): Promise<TriageOutcome> {
  if (!(await getAuth())) {
    return { ok: false, error: "Connect your Trackr account first." };
  }
  const tabs = await chrome.tabs.query({ windowId });
  const candidates = tabs.filter(
    (tab) =>
      tab.id !== undefined &&
      /^https?:/.test(tab.url ?? "") &&
      !tab.url!.startsWith(TRACKR_URL),
  );
  const open: OpenTab[] = await Promise.all(
    candidates.map(async (tab) => ({
      tabId: tab.id!,
      job: await readTab(tab.id!),
    })),
  );
  const { postings, unreadable, skipped } = postingsFrom(open);
  const run: TriageRun = {
    at: new Date().toISOString(),
    windowId,
    items: [],
    unreadable,
    skipped,
  };
  if (postings.length === 0) {
    await saveRun(run);
    return { ok: true, run };
  }

  let response: Response;
  try {
    response = await apiFetch("/api/extension/triage", {
      method: "POST",
      body: JSON.stringify({ postings: postings.map(({ job }) => job) }),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Trackr. Try again." };
  }
  if (!response.ok) {
    return {
      ok: false,
      error:
        ERRORS[response.status] ?? "Trackr couldn't score these. Try again.",
    };
  }
  const body = (await response.json()) as TriageResponse;
  if (!body.hasProfile) {
    return {
      ok: false,
      needsResume: true,
      error: "Add your resume in Trackr to score postings.",
    };
  }
  run.items = itemsFrom(postings, body);
  await saveRun(run);
  return { ok: true, run };
}

/** Saves the chosen postings to Trackr, description and all. */
export async function saveTriaged(
  windowId: number,
  keys: string[],
  submit: (
    payload: ReturnType<typeof buildSubmission>,
    tabId: number | null,
  ) => Promise<TrackResult>,
): Promise<TriageOutcome> {
  const run = await lastRun(windowId);
  if (!run)
    return { ok: false, error: "That triage has expired. Run it again." };
  let failed = 0;
  for (const item of run.items) {
    if (!keys.includes(item.key) || item.saved || item.applicationId) continue;
    const result = await submit(
      buildSubmission(
        {
          companyName: item.job.companyName,
          jobTitle: item.job.jobTitle,
          jobUrl: item.job.url,
          platform: item.job.platform ?? undefined,
          atsJobId: item.job.atsJobId,
          location: item.job.location,
          description: item.job.description,
        },
        "POPUP",
        { intent: "SAVED" },
      ),
      item.tabIds[0] ?? null,
    );
    if (result.ok) {
      item.saved = true;
      item.applicationId = result.applicationId;
    } else if (!result.queued) failed++;
  }
  await saveRun(run);
  return failed > 0
    ? { ok: false, run, error: `${failed} couldn't be saved. Try again.` }
    : { ok: true, run };
}

/** Closes the tabs of the postings let go. Nothing else is touched. */
export async function closeTriaged(
  windowId: number,
  keys: string[],
): Promise<TriageOutcome> {
  const run = await lastRun(windowId);
  if (!run)
    return { ok: false, error: "That triage has expired. Run it again." };
  const items = run.items.filter((item) => keys.includes(item.key));
  // One at a time: a tab closed by hand meanwhile mustn't stop the rest.
  await Promise.allSettled(
    items
      .flatMap((item) => item.tabIds)
      .map((tabId) => chrome.tabs.remove(tabId)),
  );
  for (const item of items) item.closed = true;
  await saveRun(run);
  return { ok: true, run };
}
