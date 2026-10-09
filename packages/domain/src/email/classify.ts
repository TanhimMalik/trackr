import type { EmailClassification } from "../enums";
import type { EmailContent } from "./types";
import {
  ASSESSMENT_PLATFORMS,
  ASSESSMENT_SENDER_DOMAINS,
  ATS_SENDER_DOMAINS,
  isFromDomain,
  JOB_BOARD_SENDER_DOMAINS,
  NO_REPLY,
  SCHEDULING_PLATFORMS,
} from "./vocabulary";

export type RuleClassification = {
  classification: EmailClassification;
  confidence: number;
  /** The sentence that decided it, quoted from the message. */
  evidence: string | null;
};

type Rule = {
  classification: Exclude<EmailClassification, "UNKNOWN" | "RECRUITER_CONTACT">;
  confidence: number;
  phrases: RegExp[];
  /** Progress-type news is ignored in hypothetical sentences ("if… we'll schedule"). */
  progress?: boolean;
  /** Sentences that look like the rule but are about something else. */
  exclude?: RegExp;
};

// In precedence order: earlier rules win when several match.
const RULES: Rule[] = [
  {
    classification: "REJECTION",
    confidence: 0.97,
    phrases: [
      /\bnot (to )?(be )?mov(e|ing) forward\b/,
      /\b(decided|chosen|decision) to (pursue|move forward with|proceed with) other candidates\b/,
      /\bmove forward with (other|another) candidates?\b/,
      /\bposition has (now )?been filled\b/,
      /\b(will|won't|are) not (be )?(proceeding|progressing)\b/,
      /\bregret to inform\b/,
      /\bnot (been )?selected\b/,
      /\bunfortunately\b.*\b(application|candidacy|position|role|other candidates)\b/,
    ],
  },
  {
    classification: "WITHDRAWAL",
    confidence: 0.95,
    phrases: [
      /\b(your )?application (has been|was) withdrawn\b/,
      /\byou('ve| have)? withdrawn (your )?application\b/,
    ],
  },
  {
    classification: "OFFER",
    confidence: 0.9,
    progress: true,
    exclude:
      /\b(financial aid|scholarship|loan|credit|card|cash ?back|points|miles|promo|discount|deal)\b/,
    phrases: [
      /\bpleased to (extend|offer) you\b/,
      /\b(extend|make) (you )?an offer\b/,
      /\boffer letter\b/,
      /\boffer of employment\b/,
      /\bverbal offer\b/,
    ],
  },
  {
    classification: "INTERVIEW_RESCHEDULE",
    confidence: 0.9,
    phrases: [
      /\breschedul(e|ed|ing)\b.*\binterview\b/,
      /\binterview\b.*\breschedul(e|ed|ing)\b/,
      /\bnew time for (your|the) interview\b/,
    ],
  },
  {
    classification: "INTERVIEW_CONFIRMATION",
    confidence: 0.95,
    phrases: [
      /\binterview (is |has been )?(confirmed|scheduled)\b/,
      /\byou('re| are) (all )?(scheduled|confirmed) for\b/,
      /\bconfirm(ing|ed)? your interview\b/,
      /\binvitation:.*\binterview\b/,
    ],
  },
  {
    classification: "ASSESSMENT",
    confidence: 0.96,
    progress: true,
    phrases: [
      /\bcoding (challenge|exercise|assessment)\b/,
      /\bonline assessment\b/,
      /\btake[- ]home (assignment|exercise|project|challenge)\b/,
      /\b(technical|skills?|online|coding|cognitive|aptitude) (assessment|test|challenge)\b/,
      /\bassessment (for|invitation|invite|link)\b/,
      /\binvited to (take|complete)\b.*\b(assessment|test|challenge)\b/,
      /\bcomplete (the|this|our|your) ([\w'’-]+ ){0,2}(assessment|test|challenge)\b/,
      /\b(hirevue|codesignal|hackerrank|codility)\b/,
    ],
    exclude: /\b(miles|deals?|sale|shop(ping)?)\b/,
  },
  {
    classification: "NEXT_ROUND",
    confidence: 0.85,
    progress: true,
    phrases: [
      /\bnext (round|stage)\b/,
      /\bfinal (round|interview)\b/,
      /\bon-?site (interview)?\b/,
      /\b(move|moving|advance) you (forward|to)\b/,
    ],
  },
  {
    classification: "INTERVIEW_REQUEST",
    confidence: 0.9,
    progress: true,
    phrases: [
      /\bschedule (an?|your|the) ([\w-]+ ){0,2}(interview|call|chat|screen|conversation)\b/,
      /\b(share|send|provide) (me |us )?your availability\b/,
      /\bset up (a|an) (call|time|interview|chat)\b/,
      /\binvite you to (an? )?interview\b/,
      /\blike to (speak|chat|talk) with you\b/,
      /\bpick a time\b/,
    ],
  },
  {
    classification: "APPLICATION_CONFIRMATION",
    confidence: 0.97,
    phrases: [
      /\bthank(s| you) for (applying|your application)\b/,
      /\bwe('ve| have) received your application\b/,
      /\byour application (has been|was) (submitted|received)\b/,
      /\bapplication (received|submitted)\b/,
      /\byour application was sent to\b/,
      /\bthank(s| you) for your interest in\b/,
      /\bthank(s| you) for (submitting )?your application\b/,
      /\bwe('ve| have)? (successfully )?received your\b.*\bapplication\b/,
      /\bapplication (confirmation|received|submitted)\b/,
      /\bsuccessfully (submitted|applied)\b/,
      /\byour application (to|for|with) .{1,100} (has been|was) (received|submitted)\b/,
      /\bapplication is in good hands\b/,
      /\bkeep track of your application\b/,
      /^indeed application: /,
    ],
  },
];

const HYPOTHETICAL = /\b(if|should|may|might|once|in the event|whether)\b/;
const INCOMPATIBLE: ReadonlySet<EmailClassification> = new Set([
  "OFFER",
  "INTERVIEW_REQUEST",
  "INTERVIEW_CONFIRMATION",
  "NEXT_ROUND",
  "ASSESSMENT",
]);
const AMBIGUOUS_CONFIDENCE = 0.6;
const ROLE_WORDS = /\b(role|position|opening|opportunity|team)\b/;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function firstMatch(rule: Rule, parts: string[]): string | null {
  for (const sentence of parts) {
    const lower = sentence.toLowerCase();
    if (rule.progress && HYPOTHETICAL.test(lower)) continue;
    if (rule.exclude?.test(lower)) continue;
    if (rule.phrases.some((phrase) => phrase.test(lower))) return sentence;
  }
  return null;
}

const quote = (sentence: string) =>
  sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence;

const BULK_LABELS = [
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_FORUMS",
];

/** A person writing directly: not a platform, not a no-reply address, not a mailing list. */
const isPersonalSender = (email: EmailContent) =>
  !isFromDomain(email.fromEmail, [
    ...ATS_SENDER_DOMAINS,
    ...JOB_BOARD_SENDER_DOMAINS,
  ]) &&
  !NO_REPLY.test(email.fromEmail.split("@")[0] ?? "") &&
  !email.hasListUnsubscribe &&
  !email.labels.some((label) => BULK_LABELS.includes(label));

/**
 * Classifies a relevant message with ordered phrase rules. The strongest
 * classification wins; rejection takes precedence over warm language, and
 * conflicting strong evidence lowers confidence so the message is reviewed
 * rather than guessed at.
 */
export function classifyEmail(email: EmailContent): RuleClassification {
  const parts = sentences(`${email.subject}\n${email.body}`);
  const links = email.links.join(" ").toLowerCase();

  const matches = new Map<EmailClassification, string>();
  for (const rule of RULES) {
    const sentence = firstMatch(rule, parts);
    if (sentence) matches.set(rule.classification, sentence);
  }
  // Links to assessment and scheduling tools are evidence on their own.
  if (
    !matches.has("ASSESSMENT") &&
    (ASSESSMENT_PLATFORMS.some((d) => links.includes(d)) ||
      isFromDomain(email.fromEmail, ASSESSMENT_SENDER_DOMAINS))
  ) {
    matches.set("ASSESSMENT", "From an assessment platform");
  }
  if (
    !matches.has("INTERVIEW_REQUEST") &&
    SCHEDULING_PLATFORMS.some((d) => links.includes(d))
  ) {
    matches.set("INTERVIEW_REQUEST", "Link to a scheduling page");
  }
  if (email.calendarStart && !matches.has("INTERVIEW_CONFIRMATION")) {
    const mentionsInterview = parts.some((s) => /\binterview\b/i.test(s));
    if (mentionsInterview) {
      matches.set(
        "INTERVIEW_CONFIRMATION",
        "Calendar invitation for an interview",
      );
    }
  }

  const winner = RULES.find((rule) => matches.has(rule.classification));
  if (!winner) {
    // A person at a company writing about a role, with no stronger news.
    const aboutRole = parts.find((s) => ROLE_WORDS.test(s.toLowerCase()));
    if (isPersonalSender(email) && aboutRole) {
      return {
        classification: "RECRUITER_CONTACT",
        confidence: 0.7,
        evidence: quote(aboutRole),
      };
    }
    return { classification: "UNKNOWN", confidence: 0, evidence: null };
  }

  let confidence = winner.confidence;
  if (
    winner.classification === "REJECTION" &&
    [...matches.keys()].some((kind) => INCOMPATIBLE.has(kind))
  ) {
    // "Unfortunately… but we'd like you to interview for another role" is
    // too mixed to act on.
    const positive = [...matches.keys()].filter((kind) =>
      INCOMPATIBLE.has(kind),
    );
    if (
      positive.some((kind) => kind === "OFFER" || kind === "INTERVIEW_REQUEST")
    ) {
      confidence = AMBIGUOUS_CONFIDENCE;
    }
  }
  // Confirmations are reliable from an ATS; from anyone else, ask.
  if (
    winner.classification === "APPLICATION_CONFIRMATION" &&
    !isFromDomain(email.fromEmail, ATS_SENDER_DOMAINS)
  ) {
    confidence = 0.93;
  }

  return {
    classification: winner.classification,
    confidence,
    evidence: quote(matches.get(winner.classification)!),
  };
}
