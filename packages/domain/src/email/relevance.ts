import type { EmailMetadata } from "./types";
import {
  anyTerm,
  APPLICATION_TERMS,
  ASSESSMENT_PLATFORMS,
  ATS_SENDER_DOMAINS,
  isFromDomain,
  APPLICATION_UPDATE_SUBJECT,
  COMMERCE_TERMS,
  JOB_ALERT_PATTERNS,
  JOB_DIGEST_SENDERS,
  JOB_BOARD_SENDER_DOMAINS,
  RECRUITING_LOCAL_PARTS,
  SCHEDULING_PLATFORMS,
  SCHOOL_OFFICE,
  SNIPPET_ONLY_TERMS,
} from "./vocabulary";

export type RelevanceSignal =
  | "KNOWN_THREAD"
  | "KNOWN_CONTACT"
  | "ATS_SENDER"
  | "JOB_BOARD_SENDER"
  | "RECRUITING_SENDER"
  | "SUBJECT_VOCABULARY"
  | "SNIPPET_VOCABULARY"
  | "ASSESSMENT_OR_SCHEDULING_LINK"
  | "JOB_ALERT"
  | "JOB_DIGEST"
  | "COMMERCE"
  | "SCHOOL"
  | "PROMOTION";

export type Relevance = {
  relevant: boolean;
  score: number;
  signals: Partial<Record<RelevanceSignal, number>>;
};

const MIN_SCORE = 3;
const MIN_POSITIVE_KINDS = 2;

const SUBJECT_TERMS = anyTerm(APPLICATION_TERMS);
const SNIPPET_TERMS = anyTerm([...APPLICATION_TERMS, ...SNIPPET_ONLY_TERMS]);

const distinctMatches = (pattern: RegExp, text: string) =>
  new Set([...text.matchAll(pattern)].map((match) => match[0].toLowerCase()))
    .size;

/**
 * Decides from metadata alone whether a message could be about a job
 * application, so bodies are fetched only for those that could. It takes two
 * different kinds of evidence; one keyword is never enough.
 */
export function scoreRelevance(email: EmailMetadata): Relevance {
  const signals: Relevance["signals"] = {};
  const localPart = email.fromEmail.split("@")[0] ?? "";
  const text = `${email.subject} ${email.snippet}`;

  // A conversation Trackr already follows, or someone it knows from an application.
  if (email.knownThread) signals.KNOWN_THREAD = 3;
  if (email.knownContact) signals.KNOWN_CONTACT = 3;
  if (isFromDomain(email.fromEmail, ATS_SENDER_DOMAINS)) signals.ATS_SENDER = 3;
  else if (isFromDomain(email.fromEmail, JOB_BOARD_SENDER_DOMAINS)) {
    signals.JOB_BOARD_SENDER = 2;
  }
  if (RECRUITING_LOCAL_PARTS.test(localPart)) signals.RECRUITING_SENDER = 1;
  if (distinctMatches(SUBJECT_TERMS, email.subject) > 0) {
    signals.SUBJECT_VOCABULARY = 2;
  }
  const snippetTerms = distinctMatches(SNIPPET_TERMS, email.snippet);
  if (snippetTerms > 0) signals.SNIPPET_VOCABULARY = Math.min(snippetTerms, 2);
  if (
    [...ASSESSMENT_PLATFORMS, ...SCHEDULING_PLATFORMS].some((domain) =>
      text.toLowerCase().includes(domain),
    )
  ) {
    signals.ASSESSMENT_OR_SCHEDULING_LINK = 2;
  }

  const positiveKinds = Object.keys(signals).length;
  if (JOB_ALERT_PATTERNS.some((pattern) => pattern.test(text))) {
    signals.JOB_ALERT = -4;
  }
  const sender = email.fromEmail.toLowerCase();
  const knownConversation = email.knownThread || email.knownContact;
  // Recommendation mail from job boards, unless it's about an application.
  if (
    JOB_DIGEST_SENDERS.some((pattern) => pattern.test(sender)) &&
    !APPLICATION_UPDATE_SUBJECT.test(email.subject) &&
    !knownConversation
  ) {
    signals.JOB_DIGEST = -5;
  }
  // "Offers" from banks and shops: commercial words, and no hiring sender.
  if (
    COMMERCE_TERMS.test(text) &&
    !signals.ATS_SENDER &&
    !signals.RECRUITING_SENDER &&
    !knownConversation
  ) {
    signals.COMMERCE = -3;
  }
  // Admissions offices say "thank you for applying" too.
  if (SCHOOL_OFFICE.test(sender) && !knownConversation) signals.SCHOOL = -5;
  if (
    email.labels.includes("CATEGORY_PROMOTIONS") &&
    email.hasListUnsubscribe &&
    !signals.ATS_SENDER &&
    !signals.RECRUITING_SENDER
  ) {
    signals.PROMOTION = -2;
  }

  const score = Object.values(signals).reduce((sum, value) => sum + value, 0);
  return {
    relevant: score >= MIN_SCORE && positiveKinds >= MIN_POSITIVE_KINDS,
    score,
    signals,
  };
}
