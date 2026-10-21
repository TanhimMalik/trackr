import {
  detectSourcePlatform,
  plainTextDescription,
  type TriagePosting,
} from "@trackr/domain";
import { detectorFor } from "../detectors";
import { findStructuredJob, textOf } from "../detectors/structured-data";

/** A posting as read from a tab: what triage scores, and saving needs. */
export type ReadJob = {
  url: string;
  companyName: string;
  jobTitle: string;
  location: string | null;
  platform: TriagePosting["platform"];
  atsJobId: string | null;
  description: string | null;
};

const withoutHash = (url: URL) => `${url.origin}${url.pathname}${url.search}`;

const html = (document: Document, selectors: string[]) => {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return plainTextDescription(element.innerHTML) || null;
  }
  return null;
};

/**
 * LinkedIn's signed-in pages don't embed the posting as data; read the job
 * details panel instead. Best effort: when LinkedIn changes its markup,
 * the tab reads as unreadable rather than wrong.
 */
function linkedInJob(document: Document, url: URL): ReadJob | null {
  if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
  const jobId =
    url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1] ??
    url.searchParams.get("currentJobId");
  if (!jobId) return null;
  const jobTitle =
    textOf(document, ".job-details-jobs-unified-top-card__job-title") ??
    textOf(document, ".top-card-layout__title");
  const companyName =
    textOf(document, ".job-details-jobs-unified-top-card__company-name") ??
    textOf(document, ".topcard__org-name-link");
  if (!jobTitle || !companyName) return null;
  return {
    url: `https://www.linkedin.com/jobs/view/${jobId}/`,
    companyName,
    jobTitle,
    location: null,
    platform: "LINKEDIN",
    atsJobId: null,
    description: html(document, [
      "#job-details",
      ".jobs-description__content",
      ".show-more-less-html__markup",
    ]),
  };
}

/**
 * The job posting a tab shows, or null when it isn't one Trackr can read:
 * the supported job boards first, then the posting a page describes in
 * structured data, which most job sites include for search engines.
 */
export function readJob(document: Document, url: URL): ReadJob | null {
  const detected = detectorFor(url)?.extractJob(document, url);
  if (detected) {
    return {
      url: detected.jobUrl,
      companyName: detected.companyName,
      jobTitle: detected.jobTitle,
      location: detected.location,
      platform: detected.platform,
      atsJobId: detected.atsJobId,
      description: detected.description,
    };
  }

  const structured = findStructuredJob(document);
  if (structured?.title && structured.companyName) {
    return {
      url: withoutHash(url),
      companyName: structured.companyName,
      jobTitle: structured.title,
      location: structured.location,
      platform: detectSourcePlatform(url.href),
      atsJobId: null,
      description: structured.description,
    };
  }

  return linkedInJob(document, url);
}
