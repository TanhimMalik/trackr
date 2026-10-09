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

/**
 * Job-board senders whose mail is recommendations and marketing, never news
 * about an application: Indeed's matches, LinkedIn's job alerts and
 * newsletters, and matching services. Updates those boards do send come from
 * other addresses (indeedapply@indeed.com, jobs-noreply@linkedin.com) or say
 * so in the subject (`APPLICATION_UPDATE_SUBJECT`).
 */
export const JOB_DIGEST_SENDERS = [
  /@match\.indeed\.com$/,
  /^(jobalerts|editors|news|jobs-listings)-noreply@linkedin\.com$/,
  /@(mail-)?hackajob\.com$/,
  /@notifications\.joinhandshake\.com$/,
  /@glassdoor\.com$/,
  /@builtin\.com$/,
  /@jobright\.ai$/,
  /@levels\.fyi$/,
];

/** A subject about the person's own application, from any sender. */
export const APPLICATION_UPDATE_SUBJECT =
  /\b(your application|application (was |has been )?(sent|submitted|received|viewed)|you applied|interview|assessment)\b/i;

/** "Offers" from banks, airlines and shops, not employers. */
export const COMMERCE_TERMS =
  /\b(credit|card|cash ?back|points|miles|rewards?|promo|discount|deals?|coupon|shopping|% off|financial aid|scholarship)\b/i;

/** School offices: admissions, enrollment, career services and alumni mail. */
export const SCHOOL_OFFICE =
  /^(admissions?|enroll(ment)?|outreach|financial-?aid|registrar|alumni|careers?|career-?services|student-?affairs)@[\w.-]+\.edu$/i;

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
