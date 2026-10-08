import {
  detectSourcePlatform,
  type CaptureMode,
  type ExtensionSubmissionPayload,
} from "@trackr/domain";
import type { JobDraft } from "./types";

/** The report sent to Trackr for a job, captured automatically or from the popup. */
export function buildSubmission(
  job: JobDraft,
  captureMode: CaptureMode,
  {
    now = new Date(),
    id = crypto.randomUUID(),
  }: { now?: Date; id?: string } = {},
): ExtensionSubmissionPayload {
  return {
    clientSubmissionId: id,
    captureMode,
    platform: job.platform ?? detectSourcePlatform(job.jobUrl),
    companyName: job.companyName.trim(),
    jobTitle: job.jobTitle.trim(),
    jobUrl: job.jobUrl.trim(),
    atsJobId: job.atsJobId ?? null,
    location: job.location ?? null,
    submittedAt: now.toISOString(),
  };
}

const MINUTE_MS = 60 * 1000;
/** Queued submissions are given up on after a week. */
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * MINUTE_MS;

/** 1, 2, 4, 8… minutes between retries, at most six hours. */
export function retryDelayMs(attempts: number): number {
  return Math.min(
    2 ** Math.max(0, attempts - 1) * MINUTE_MS,
    6 * 60 * MINUTE_MS,
  );
}

/** What a page says about itself, read by the popup on sites without a detector. */
export type PageMetadata = {
  url: string;
  title: string;
  ogTitle: string | null;
  siteName: string | null;
};

const SEPARATORS = /\s+[|–—-]\s+|\s+@\s+|\s+at\s+/;

/**
 * A best guess at the job on an arbitrary page, for the popup to pre-fill.
 * The person can correct it before tracking.
 */
export function guessJobFromPage(page: PageMetadata): JobDraft | null {
  let url: URL;
  try {
    url = new URL(page.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const heading = (page.ogTitle ?? page.title).trim();
  const [first, second] = heading.split(SEPARATORS).map((part) => part.trim());
  const host = url.hostname.replace(/^(www|jobs|careers)\./, "");
  const fromHost = host.split(".")[0] ?? "";
  const companyName =
    page.siteName?.trim() ||
    (second && second.length < 60 ? second : "") ||
    fromHost.charAt(0).toUpperCase() + fromHost.slice(1);

  return {
    companyName,
    jobTitle: first && first !== companyName ? first : "",
    jobUrl: `${url.origin}${url.pathname}`,
  };
}
