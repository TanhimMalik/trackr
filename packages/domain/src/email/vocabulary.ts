// Sender and vocabulary lists the relevance filter and classifier use. They
// are data, tuned against the fixture corpus in email.fixtures.ts.

/** Applicant tracking systems that send mail for many employers. */
export const ATS_SENDER_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "hire.lever.co",
  "ashbyhq.com",
  "myworkday.com",
  "myworkdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "jobvite.com",
  "workablemail.com",
  "bamboohr.com",
  // Seen in real inboxes: hiring platforms that email on employers' behalf.
  "rippling.com",
  "yello.co",
  "careerparcel.com",
  "trakstar.com",
  "polymer.co",
  "adp.com",
  "successfactors.com",
  "successfactors.eu",
  "taleo.net",
  "oraclecloud.com",
  "avature.net",
  "phenompeople.com",
  "eightfold.ai",
  "paradox.ai",
  "recruitee.com",
  "breezy.hr",
  "jazzhr.com",
  "applytojob.com",
  "ultipro.com",
  "dayforcehcm.com",
  "brassring.com",
];

/** Assessment platforms that email invitations on employers' behalf. */
export const ASSESSMENT_SENDER_DOMAINS = [
  "shl.com",
  "hirevue.com",
  "hackerrank.com",
  "codesignal.com",
  "codility.com",
  "karat.com",
  "coderpad.io",
];

/** Job boards whose application messages are worth reading. */
export const JOB_BOARD_SENDER_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "indeedemail.com",
  "joinhandshake.com",
  "dice.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "wellfound.com",
  "hackajob.com",
  "mail-hackajob.com",
  "builtin.com",
  "jobright.ai",
];

export const RECRUITING_LOCAL_PARTS =
  /^(careers?|recruit(ing|ment|er)?s?|talent|jobs?|hiring|people|hr|applications?|no-?reply-?(recruiting|careers))\b/i;

export const NO_REPLY = /^(no-?reply|do-?not-?reply|notifications?|mailer)/i;

export const APPLICATION_TERMS = [
  "application",
  "applied",
  "applying",
  "candidate",
  "candidacy",
  "position",
  "role",
  "interview",
  "assessment",
  "coding challenge",
  "offer",
  "next steps",
  "next round",
  "final round",
];

export const SNIPPET_ONLY_TERMS = [
  "unfortunately",
  "moving forward",
  "schedule",
  "availability",
  "recruiter",
  "consideration",
  "take-home",
  "time that works",
  "portfolio",
];

export const ASSESSMENT_PLATFORMS = [
  "hackerrank.com",
  "codesignal.com",
  "codility.com",
  "coderpad.io",
  "karat.com",
];

export const SCHEDULING_PLATFORMS = [
  "calendly.com",
  "goodtime.io",
  "cal.com",
  "greenhouse.io/scheduling",
  "ashbyhq.com/scheduling",
];

export const JOB_ALERT_PATTERNS = [
  /jobs? you may be interested in/i,
  /\bjob alert\b/i,
  /recommended (jobs? )?for you/i,
  /new jobs? (matching|for)/i,
  /\bjobs? digest\b/i,
  /\bjust posted a \d+% match\b/i,
  /\b\d+ more [\w ]*jobs\b/i,
  /\bis hiring( an?)?\b/i,
  /\bjobs? (were )?selected for you\b/i,
  /\bhot jobs\b/i,
  /\bhiring alert\b/i,
  /\bmatching jobs\b/i,
];

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive pattern that matches any of the terms as whole words, or their plurals. */
export const anyTerm = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escape).join("|")})s?\\b`, "gi");

/** The registrable part of an address's domain: "mail.greenhouse.io" → "greenhouse.io". */
export function senderDomain(email: string): string {
  const host = email.split("@")[1]?.toLowerCase().trim() ?? "";
  const parts = host.split(".");
  return parts.slice(-2).join(".");
}

export const isFromDomain = (email: string, domains: readonly string[]) => {
  const host = email.split("@")[1]?.toLowerCase() ?? "";
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
};
