import {
  companyFromSlug,
  findStructuredJob,
  metaContent,
  visibleText,
} from "./structured-data";
import type { PlatformDetector } from "./types";

const POSTING =
  /^\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/application)?\/?$/i;
const SUCCESS =
  /application (was )?(successfully )?submitted|thank(s| you) for applying|application has been received/i;

export const ashby: PlatformDetector = {
  platform: "ASHBY",

  matches: (url) => url.hostname === "jobs.ashbyhq.com",

  extractJob(document, url) {
    const match = url.pathname.match(POSTING);
    if (!match) return null;
    const [, slug, postingId] = match;
    const structured = findStructuredJob(document);
    // "Software Engineer @ Example"
    const [titleRole, titleCompany] = document.title.split(" @ ");

    const jobTitle =
      structured?.title ??
      (titleCompany ? titleRole!.trim() : null) ??
      metaContent(document, "og:title");
    if (!jobTitle) return null;

    return {
      platform: "ASHBY",
      companyName:
        structured?.companyName ??
        titleCompany?.trim() ??
        companyFromSlug(slug!),
      jobTitle,
      jobUrl: `https://jobs.ashbyhq.com/${slug}/${postingId}`,
      atsJobId: postingId!.toLowerCase(),
      location: structured?.location ?? null,
    };
  },

  // The form is a single-page app without a <form> element; its container
  // and system email field are the reliable markers.
  hasApplicationForm: (document) =>
    document.querySelector(
      ".ashby-application-form-container, #_systemfield_email",
    ) !== null,

  // There's no confirmation page: the form is replaced by a message.
  confirmation(document) {
    return !this.hasApplicationForm(document) &&
      SUCCESS.test(visibleText(document.body))
      ? "state"
      : null;
  },
};
