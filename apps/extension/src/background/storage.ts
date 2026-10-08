import type { SubmissionOutcome } from "@trackr/domain";
import type { JobContext } from "../shared/types";

const JOB_TTL_MS = 2 * 60 * 60 * 1000;

const jobKey = (tabId: number) => `job:${tabId}`;
const trackedKey = (tabId: number) => `tracked:${tabId}`;

export type Tracked = { applicationId: string; outcome: SubmissionOutcome };

// Per-tab state lives in session storage: cleared when the browser closes,
// and only readable by the extension itself.

export async function saveJob(tabId: number, job: JobContext): Promise<void> {
  await chrome.storage.session.set({ [jobKey(tabId)]: job });
}

/** The job captured earlier in this tab, if it is recent enough. */
export async function getJob(tabId: number): Promise<JobContext | null> {
  const key = jobKey(tabId);
  const job = (await chrome.storage.session.get(key))[key] as
    JobContext | undefined;
  if (!job) return null;
  if (Date.now() - new Date(job.capturedAt).getTime() > JOB_TTL_MS) {
    await chrome.storage.session.remove(key);
    return null;
  }
  return job;
}

export async function clearJob(tabId: number): Promise<void> {
  await chrome.storage.session.remove(jobKey(tabId));
}

export async function setTracked(tabId: number, tracked: Tracked) {
  await chrome.storage.session.set({ [trackedKey(tabId)]: tracked });
}

export async function getTracked(tabId: number): Promise<Tracked | null> {
  const key = trackedKey(tabId);
  return ((await chrome.storage.session.get(key))[key] as Tracked) ?? null;
}

export async function forgetTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove([jobKey(tabId), trackedKey(tabId)]);
}
