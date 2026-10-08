import {
  companyFromSlug,
  findStructuredJob,
  textOf,
  visibleText,
} from "./structured-data";
import type { PlatformDetector } from "./types";

const HOSTS = new Set(["jobs.lever.co", "jobs.eu.lever.co"]);
const POSTING =
  /^\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/(apply|thanks))?\/?$/i;
const SUCCESS = /application submitted|thanks for applying/i;

export const lever: PlatformDetector = {
  platform: "LEVER",

  matches: (url) => HOSTS.has(url.hostname),

  extractJob(document, url) {
    const match = url.pathname.match(POSTING);
    if (!match) return null;
    const [, slug, postingId] = match;
    const structured = findStructuredJob(document);
    // "Example - Software Engineer"
    const [titleCompany, ...titleRest] = document.title.split(" - ");

    const jobTitle =
      structured?.title ??
      textOf(document, ".posting-headline h2") ??
      (titleRest.length > 0 ? titleRest.join(" - ").trim() : null);
    if (!jobTitle) return null;

    return {
      platform: "LEVER",
      companyName:
        structured?.companyName ??
        (titleRest.length > 0 ? titleCompany!.trim() : null) ??
        companyFromSlug(slug!),
      jobTitle,
      jobUrl: `https://${url.hostname}/${slug}/${postingId}`,
      atsJobId: postingId!.toLowerCase(),
      location:
        structured?.location ??
        textOf(document, ".posting-categories .location"),
    };
  },

  hasApplicationForm: (document) =>
    document.querySelector("#application-form") !== null,

  confirmation(document, url) {
    if (POSTING.exec(url.pathname)?.[4] === "thanks") return "url";
    return !this.hasApplicationForm(document) &&
      SUCCESS.test(visibleText(document.body))
      ? "state"
      : null;
  },
};
