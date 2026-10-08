import {
  companyFromSlug,
  findStructuredJob,
  metaContent,
  textOf,
  visibleText,
} from "./structured-data";
import type { PlatformDetector } from "./types";

const HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
]);

// "Job Application for Software Engineer at Example"
const PAGE_TITLE = /^Job Application for (.+) at (.+)$/;
const SUCCESS =
  /thank you for applying|application (has been )?(submitted|received)/i;

/** The board and job id from /{board}/jobs/{id} or the embed's ?for=&token=. */
function jobRef(url: URL): { board: string; id: string | null } | null {
  const path = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (path) return { board: path[1]!, id: path[2]! };
  const board = url.searchParams.get("for");
  const token = url.searchParams.get("token");
  if (url.pathname.startsWith("/embed/") && board) {
    return { board, id: token && /^\d+$/.test(token) ? token : null };
  }
  return null;
}

export const greenhouse: PlatformDetector = {
  platform: "GREENHOUSE",

  matches: (url) => HOSTS.has(url.hostname),

  extractJob(document, url) {
    const ref = jobRef(url);
    if (!ref) return null;
    const structured = findStructuredJob(document);
    const fromTitle = document.title.trim().match(PAGE_TITLE);

    const jobTitle =
      structured?.title ??
      textOf(document, ".job__title h1") ??
      textOf(document, ".app-title") ??
      fromTitle?.[1] ??
      metaContent(document, "og:title");
    const companyName =
      structured?.companyName ??
      fromTitle?.[2] ??
      textOf(document, ".company-name")?.replace(/^at\s+/i, "") ??
      companyFromSlug(ref.board);
    if (!jobTitle) return null;

    const host = url.pathname.startsWith("/embed/")
      ? "job-boards.greenhouse.io"
      : url.hostname;
    return {
      platform: "GREENHOUSE",
      companyName,
      jobTitle,
      jobUrl: ref.id ? `https://${host}/${ref.board}/jobs/${ref.id}` : url.href,
      atsJobId: ref.id,
      location:
        structured?.location ??
        textOf(document, ".job__location") ??
        textOf(document, ".location"),
    };
  },

  hasApplicationForm: (document) =>
    document.querySelector("#application-form, #application_form") !== null,

  confirmation(document, url) {
    if (/\/jobs\/\d+\/confirmation\/?$/.test(url.pathname)) return "url";
    return !this.hasApplicationForm(document) &&
      SUCCESS.test(visibleText(document.body))
      ? "state"
      : null;
  },
};
