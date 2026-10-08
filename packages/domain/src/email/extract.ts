import type { InterviewType, SourcePlatform } from "../enums";
import type { EmailContent } from "./types";
import {
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

// Display-name noise around the company: "Datadog Hiring Team", "Stripe Recruiting".
const NAME_SUFFIX =
  /\s*(\b(hiring|recruiting|recruitment|talent( acquisition)?|careers?|jobs|people|team|hr)\b\s*)+$/i;
const NAME_VIA =
  /\s+(via|@|at)\s+(greenhouse|lever|ashby|workday|linkedin|indeed)\b.*$/i;

const COMPANY_PATTERNS = [
  /\b(?:applying|application|applied) (?:to|at|with) ([A-Z][\w&.'’ -]{1,40}?)(?=[!.,:;|)]|\s+(?:for|-|–)\s|$)/,
  /\binterest in (?:joining |working at )?([A-Z][\w&.'’ -]{1,40}?)(?=[!.,:;|)]|\s+(?:for|-|–)\s|$)/,
  /\b(?:your|an?) (?:interview|offer|role|position) (?:at|with) ([A-Z][\w&.'’ -]{1,40}?)(?=[!.,:;|)]|\s+(?:for|-|–)\s|$)/,
];

const TITLE_PATTERNS = [
  /\b(?:for|to) the (?:role of |position of )?([A-Z][\w,/&+#().' -]{2,80}?) (?:position|role|opening|job)\b/,
  /\b(?:application|applying|applied) for (?:the )?([A-Z][\w,/&+#().' -]{2,80}?)(?: (?:position|role))? (?:at|with)\b/,
  /\b(?:position|role) of ([A-Z][\w,/&+#().' -]{2,80}?)(?=[.,!]| at )/,
];

const GREENHOUSE_JOB = /greenhouse\.io\/[^/\s]+\/jobs\/(\d+)|[?&]gh_jid=(\d+)/i;
const LEVER_JOB = /jobs\.(?:eu\.)?lever\.co\/[^/\s]+\/([0-9a-f-]{36})/i;
const ASHBY_JOB = /jobs\.ashbyhq\.com\/[^/\s]+\/([0-9a-f-]{36})/i;

function cleanCompany(name: string | null | undefined): string | null {
  const value = name
    ?.replace(NAME_VIA, "")
    .replace(NAME_SUFFIX, "")
    .replace(/^the\s+/i, "")
    .trim();
  return value &&
    value.length > 1 &&
    !/^(no-?reply|notifications?)$/i.test(value)
    ? value
    : null;
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
  ]);
  const personal =
    !fromAts && !NO_REPLY.test(email.fromEmail.split("@")[0] ?? "");
  const domain = fromAts ? null : senderDomain(email.fromEmail);

  const fromText = COMPANY_PATTERNS.map((pattern) => text.match(pattern)?.[1])
    .map(cleanCompany)
    .find(Boolean);
  // A person's name isn't a company: only trust display names from non-personal senders.
  const fromName = personal ? null : cleanCompany(email.fromName);
  const fromDomain = domain ? titleCase(domain.split(".")[0]!) : null;

  const lower = text.toLowerCase();
  return {
    companyName: fromText ?? fromName ?? fromDomain,
    companyDomain: domain,
    jobTitle:
      TITLE_PATTERNS.map((pattern) => text.match(pattern)?.[1]?.trim()).find(
        (title) => title && title.split(" ").length <= 10,
      ) ?? null,
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
