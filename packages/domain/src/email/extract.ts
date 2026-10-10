import type { InterviewType, SourcePlatform } from "../enums";
import type { EmailContent } from "./types";
import {
  ASSESSMENT_SENDER_DOMAINS,
  ATS_SENDER_DOMAINS,
  isFromDomain,
  JOB_BOARD_SENDER_DOMAINS,
  NO_REPLY,
  senderDomain,
} from "./vocabulary";

export type ExtractedDetails = {
  companyName: string | null;
  /** The employer's own domain, when the message came from it. */
  companyDomain: string | null;
  jobTitle: string | null;
  platform: SourcePlatform | null;
  atsJobId: string | null;
  recruiter: { name: string | null; email: string } | null;
  interviewAt: string | null;
  interviewKind: InterviewType | null;
  isFinalRound: boolean;
};

// Display-name noise around the company: "Datadog Hiring Team", "Northwind Early Careers".
const NAME_SUFFIX =
  /\s*(\b(early careers?|university recruiting|campus recruiting|hiring|recruiting|recruitment|talent( acquisition)?|careers?|jobs|people|team|hr|workday|notifications?)\b\s*)+$/i;
// "Careers | Tailspin + Co".
const NAME_PREFIX = /^(careers?|jobs|recruiting|hiring)\s*[|:–-]\s*/i;
// "Contoso @ icims", "Acme via Greenhouse".
const NAME_VIA = /\s+(via|@)\s+\S+.*$/i;
const LEGAL_SUFFIX = /,?\s+(inc|llc|ltd|corp|co)\.?$/i;

// Joining words match in either case ("Application With"), but the captured
// company or title must start with a capital letter.
const kw = (...phrases: string[]) =>
  `(?:${phrases
    .map((phrase) =>
      phrase
        .split(" ")
        .map(
          (word) =>
            `[${word[0]!.toUpperCase()}${word[0]!.toLowerCase()}]${word.slice(1)}`,
        )
        .join(" "),
    )
    .join("|")})`;

// Where a company or title ends: punctuation, a line break, or a joining word.
const END = String.raw`(?=,? Inc\b|[!.,:;|)]|\s+(?:for|-|–|—)\s|\s+(?:is|was|has|are|will|using|positions?|roles?|opportunit(?:y|ies)|teams?)\b|\s*$)`;
const COMPANY = String.raw`([A-Z][\w&.'’ -]{1,40}?)`;

const COMPANY_PATTERNS = [
  new RegExp(
    String.raw`\b${kw("applying", "application", "applied")} ${kw("to", "at", "with")} ${COMPANY}${END}`,
    "m",
  ),
  // "Your application for Software Engineer Intern at Pinterest"
  new RegExp(
    String.raw`\b${kw("application", "applying", "applied")} ${kw("for")} .{2,100}? ${kw("at", "with")} ${COMPANY}${END}`,
    "m",
  ),
  new RegExp(
    String.raw`\b${kw("interest in", "sent to", "submitted to")} (?:joining |working at |a career at )?${COMPANY}${END}`,
    "m",
  ),
  new RegExp(
    String.raw`\b${kw("your", "an", "a")} ${kw("interview", "offer", "role", "position")} ${kw("at", "with")} ${COMPANY}${END}`,
    "m",
  ),
  new RegExp(
    String.raw`\b${kw("your")} ([A-Z][\w&.'’-]{1,30}(?: [A-Z][\w&.'’-]{1,30})?) ${kw("application")}\b`,
    "m",
  ),
  new RegExp(
    String.raw`^([A-Z][\w&.'’ -]{1,40}?)\s*[|:]\s*${kw("application", "thank", "we", "your")}`,
    "m",
  ),
  // "Sent by the HR team at Municipal Credit Union using ADP services".
  new RegExp(
    String.raw`\b(?:HR|[Rr]ecruiting|[Tt]alent|[Hh]iring) team at ${COMPANY}${END}`,
    "m",
  ),
  // "Complete your Contoso skills assessment", "your skills assessment for Contoso."
  new RegExp(
    String.raw`\b${kw("complete", "take")} your ([A-Z][\w&.'’-]{1,30}(?: [A-Z][\w&.'’-]{1,30})?) (?:skills? |online |coding |technical )?${kw("assessment", "test")}\b`,
    "m",
  ),
  new RegExp(String.raw`\b${kw("assessment for")} ${COMPANY}${END}`, "m"),
  // Lowercase brands: "Thank you for applying to lumen."
  /\b[Aa]pplying to ([a-z][\w&'’-]{1,30})(?=[!.,])/m,
];

// Words that look like a company but aren't one.
const NOT_A_COMPANY =
  /^(indeed|linkedin|important|reminder|update|action required|re|fwd|application|thank you|thanks|congratulations|hi|hello|dear|please|job|you|our|us|the|this|join|a|an)\b/i;
// Role words: a "company" made of these is really a job title.
const ROLE_WORDS =
  /\b(engineer(ing)?|developer|analyst|intern(ship)?|manager|designer|architect|specialist|associate|scientist|technician|administrator|consultant|coordinator|representative|assistant)\b/i;

const TITLE = String.raw`([A-Z][\w,/&+#().'’ -]{2,80}?)`;
// Where a title ends: "position", "at Company", "job was submitted", punctuation.
const TITLE_END = String.raw`(?= ${kw("position", "role", "opening")}\b| ${kw("at", "with")} | (?:job )?(?:was|has been|is)\b|[!.]|\s*$)`;
const TITLE_PATTERNS = [
  // "Assessment for (General Hire) Software Engineer Intern (…)-2027 Summer - Northwind Early Careers"
  new RegExp(
    String.raw`\b${kw("assessment for", "invitation for", "interview for")} (?:\([^)]*\)\s*)?(.+?)(?:\s+[-–—]\s+[^-–—]*)?\s*$`,
    "m",
  ),
  new RegExp(
    String.raw`^(?:${kw("re")}:\s*)?${kw("application received", "application confirmation", "application submitted", "indeed application", "thank you for applying")}\s*(?:${kw("for")}|[:–—-])\s*(.+?)\s*$`,
    "m",
  ),
  new RegExp(
    String.raw`\b${kw("application", "applying", "applied")} ${kw("for")} (?:the )?${TITLE}${TITLE_END}`,
    "m",
  ),
  new RegExp(
    String.raw`\b${kw("for", "to")} the (?:role of |position of )?${TITLE} ${kw("position", "role", "opening", "job")}\b`,
    "m",
  ),
  new RegExp(
    String.raw`\b${kw("position", "role")} of ${TITLE}(?=[.,!]| at |\s+(?:Our|We|You|The|This|If)\b|\s*$)`,
    "m",
  ),
];

// Requisition numbers and trailing noise around a title.
const REQUISITION = /^(?:R-|REQ-?|JR-?|J-?)?\d[\d-]*\s+/i;
const TITLE_TAIL = /\s+(position|role|opening)$/i;

function cleanTitle(title: string | undefined): string | null {
  const value = title
    ?.trim()
    .replace(REQUISITION, "")
    .replace(TITLE_TAIL, "")
    .trim();
  if (!value || value.length < 3) return null;
  if (value.split(/\s+/).length > 12 || /\b(you|your|we|our)\b/i.test(value)) {
    return null;
  }
  return value;
}

/** The first pattern that matches, trying the subject before the body. */
function firstCapture(
  patterns: RegExp[],
  texts: string[],
  clean: (value: string | undefined) => string | null,
) {
  for (const text of texts) {
    for (const pattern of patterns) {
      const value = clean(text.match(pattern)?.[1]);
      if (value) return value;
    }
  }
  return null;
}

const GREENHOUSE_JOB = /greenhouse\.io\/[^/\s]+\/jobs\/(\d+)|[?&]gh_jid=(\d+)/i;
const LEVER_JOB = /jobs\.(?:eu\.)?lever\.co\/[^/\s]+\/([0-9a-f-]{36})/i;
const ASHBY_JOB = /jobs\.ashbyhq\.com\/[^/\s]+\/([0-9a-f-]{36})/i;

function cleanCompany(name: string | null | undefined): string | null {
  const value = name
    ?.replace(NAME_VIA, "")
    .replace(NAME_PREFIX, "")
    .replace(NAME_SUFFIX, "")
    .replace(LEGAL_SUFFIX, "")
    .replace(/^the\s+/i, "")
    .trim();
  return value &&
    value.length > 1 &&
    !/^(no-?reply|notifications?)$/i.test(value) &&
    !NOT_A_COMPANY.test(value) &&
    !ROLE_WORDS.test(value)
    ? value
    : null;
}

/** "wingtiptoys@myworkday.com" → "Wingtiptoys"; generic senders → null. */
function workdayTenant(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  if (
    !/^[a-z][a-z0-9]{2,}$/i.test(local) ||
    NO_REPLY.test(local) ||
    /^workday/i.test(local)
  ) {
    return null;
  }
  return local.charAt(0).toUpperCase() + local.slice(1);
}

const titleCase = (word: string) =>
  word ? word[0]!.toUpperCase() + word.slice(1) : word;

function platformAndJobId(email: EmailContent) {
  const haystack = [...email.links, email.body].join(" ");
  const greenhouse = haystack.match(GREENHOUSE_JOB);
  if (greenhouse)
    return {
      platform: "GREENHOUSE" as const,
      atsJobId: greenhouse[1] ?? greenhouse[2]!,
    };
  const lever = haystack.match(LEVER_JOB);
  if (lever)
    return { platform: "LEVER" as const, atsJobId: lever[1]!.toLowerCase() };
  const ashby = haystack.match(ASHBY_JOB);
  if (ashby)
    return { platform: "ASHBY" as const, atsJobId: ashby[1]!.toLowerCase() };

  const from = email.fromEmail;
  if (isFromDomain(from, ["greenhouse.io", "greenhouse-mail.io"]))
    return { platform: "GREENHOUSE" as const, atsJobId: null };
  if (isFromDomain(from, ["lever.co"]))
    return { platform: "LEVER" as const, atsJobId: null };
  if (isFromDomain(from, ["ashbyhq.com"]))
    return { platform: "ASHBY" as const, atsJobId: null };
  if (isFromDomain(from, ["myworkday.com", "myworkdayjobs.com"]))
    return { platform: "WORKDAY" as const, atsJobId: null };
  return { platform: null, atsJobId: null };
}

function interviewKind(text: string): InterviewType | null {
  if (/\b(final round|final interview)\b/.test(text)) return "FINAL";
  if (/\bon-?site\b/.test(text)) return "ONSITE";
  if (
    /\b(technical|coding|system design|pair(ing)?) (interview|round|screen)\b/.test(
      text,
    )
  )
    return "TECHNICAL";
  if (/\bhiring manager\b/.test(text)) return "HIRING_MANAGER";
  if (/\b(recruiter|phone) screen\b|\bintro(ductory)? call\b/.test(text))
    return "RECRUITER_SCREEN";
  return null;
}

/**
 * Pulls what a job email says about the application: company, role, the
 * posting's id, the recruiter and any interview time. Anything not clearly
 * stated is left empty rather than guessed.
 */
export function extractEmailDetails(email: EmailContent): ExtractedDetails {
  const text = `${email.subject}\n${email.body}`;
  const fromAts = isFromDomain(email.fromEmail, [
    ...ATS_SENDER_DOMAINS,
    ...JOB_BOARD_SENDER_DOMAINS,
    ...ASSESSMENT_SENDER_DOMAINS,
  ]);
  const personal =
    !fromAts && !NO_REPLY.test(email.fromEmail.split("@")[0] ?? "");
  const domain = fromAts ? null : senderDomain(email.fromEmail);

  const texts = [email.subject, email.body];
  const fromText = firstCapture(COMPANY_PATTERNS, texts, cleanCompany);
  const fromBoard = isFromDomain(email.fromEmail, JOB_BOARD_SENDER_DOMAINS);
  // A person's name isn't a company, and neither is a job board's.
  // A hiring platform signing with its own name ("SHL", "Workable") isn't the employer.
  const platformBrand = senderDomain(email.fromEmail).split(".")[0] ?? "";
  const displayName = cleanCompany(email.fromName);
  const fromName =
    personal ||
    fromBoard ||
    (fromAts &&
      displayName?.toLowerCase().replace(/\s+/g, "") ===
        platformBrand.toLowerCase())
      ? null
      : displayName;
  const fromDomain = domain ? titleCase(domain.split(".")[0]!) : null;
  // Workday tenants send as <employer>@myworkday.com.
  const fromWorkdayTenant = isFromDomain(email.fromEmail, [
    "myworkday.com",
    "myworkdayjobs.com",
  ])
    ? workdayTenant(email.fromEmail)
    : null;

  const companyName = fromText ?? fromName ?? fromWorkdayTenant ?? fromDomain;
  const title = firstCapture(TITLE_PATTERNS, texts, cleanTitle);
  // "Application for Vialto Partners" names the company, not a role.
  const titleIsCompany =
    title !== null &&
    companyName !== null &&
    title.toLowerCase().startsWith(companyName.toLowerCase());

  const lower = text.toLowerCase();
  return {
    companyName,
    companyDomain: domain,
    jobTitle: titleIsCompany ? null : title,
    ...platformAndJobId(email),
    recruiter: personal
      ? {
          name: email.fromName?.trim() || null,
          email: email.fromEmail.toLowerCase(),
        }
      : null,
    interviewAt: email.calendarStart,
    interviewKind: interviewKind(lower),
    isFinalRound: /\bfinal (round|interview|stage)\b/.test(lower),
  };
}
