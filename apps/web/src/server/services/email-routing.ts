import "server-only";
import {
  CLASSIFICATION_EVENTS,
  CONFIDENCE_THRESHOLDS,
  decideAutomation,
  matchApplication,
  normalizeCompanyName,
  normalizeJobTitle,
  senderDomain,
  type ApplicationStatus,
  type ClassificationMethod,
  type EmailClassification,
  type MatchResult,
  type SourcePlatform,
} from "@trackr/domain";
import { and, count, eq, isNull, max, sql } from "drizzle-orm";
import { applicationEvents, applications } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { findMatchCandidates } from "./matching";
import { getEmailAutomation } from "./settings";

/** What a classified email says, as the router needs it. */
export type EmailSignal = {
  classification: EmailClassification;
  confidence: number;
  method: ClassificationMethod;
  companyName: string | null;
  companyDomain: string | null;
  jobTitle: string | null;
  platform: SourcePlatform | null;
  atsJobId: string | null;
  fromEmail: string;
  threadId: string;
  receivedAt: Date;
};

export type EmailRoute = { match: MatchResult | null } & (
  | { action: "apply"; applicationId: string }
  | { action: "create" }
  | {
      action: "review";
      kind:
        "EMAIL_UNMATCHED" | "EMAIL_POSSIBLE_MATCH" | "LOW_CONFIDENCE_UPDATE";
      candidateId: string | null;
    }
  | { action: "ignore" }
);

const CLOSED: readonly ApplicationStatus[] = ["REJECTED", "WITHDRAWN"];
// Events that move an application forward, for ordering checks.
const PROGRESS_EVENTS = [
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_RESCHEDULED",
  "NEXT_ROUND",
  "OFFER_RECEIVED",
] as const;
// News that moves an application forward.
const PROGRESS: ReadonlySet<EmailClassification> = new Set([
  "ASSESSMENT",
  "INTERVIEW_REQUEST",
  "INTERVIEW_CONFIRMATION",
  "INTERVIEW_RESCHEDULE",
  "NEXT_ROUND",
  "OFFER",
]);

/** Admissions offices send "we received your application" too. */
const fromSchool = (email: string) => /\.edu$/i.test(email);

/**
 * Whether an email about a job that isn't tracked (or one tracked as
 * closed) should start an application: a confident confirmation, a
 * rejection (so the history is complete), or progress such as an
 * assessment, from a company or hiring platform rather than a school.
 */
function canStartApplication(signal: EmailSignal): boolean {
  if (!signal.companyName || fromSchool(signal.fromEmail)) return false;
  switch (signal.classification) {
    case "APPLICATION_CONFIRMATION":
      return signal.confidence >= CONFIDENCE_THRESHOLDS.flagged;
    case "REJECTION":
      return signal.confidence >= CONFIDENCE_THRESHOLDS.automatic;
    default:
      return PROGRESS.has(signal.classification) && signal.confidence >= 0.85;
  }
}

async function candidateFacts(
  tx: Database,
  userId: string,
  applicationId: string,
) {
  const [application] = await tx
    .select({
      status: applications.currentStatus,
      companyNameNorm: applications.companyNameNorm,
    })
    .from(applications)
    .where(eq(applications.id, applicationId));
  const [confirmations] = await tx
    .select({ n: count() })
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.applicationId, applicationId),
        eq(applicationEvents.eventType, "APPLICATION_CONFIRMATION_RECEIVED"),
        isNull(applicationEvents.revertedAt),
      ),
    );
  const [atCompany] = await tx
    .select({ n: count() })
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.companyNameNorm, application!.companyNameNorm),
      ),
    );
  const [timeline] = await tx
    .select({
      // When it was closed, and its latest step forward.
      closedAt: max(
        sql<Date>`case when ${applicationEvents.eventType} in ('REJECTION_RECEIVED', 'APPLICATION_WITHDRAWN') then ${applicationEvents.eventTimestamp} end`,
      ),
      latestProgressAt: max(
        sql<Date>`case when ${applicationEvents.eventType} in (${sql.join(
          PROGRESS_EVENTS.map((type) => sql`${type}`),
          sql`, `,
        )}) then ${applicationEvents.eventTimestamp} end`,
      ),
    })
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.applicationId, applicationId),
        isNull(applicationEvents.revertedAt),
      ),
    );
  const asDate = (value: Date | string | null | undefined) =>
    value ? new Date(value) : null;
  return {
    status: application!.status,
    hasConfirmation: (confirmations?.n ?? 0) > 0,
    applicationsAtCompany: atCompany?.n ?? 0,
    closedAt: asDate(timeline?.closedAt),
    latestProgressAt: asDate(timeline?.latestProgressAt),
  };
}

/**
 * Decides what a classified email does: update an application, start one,
 * ask the person, or nothing. On top of the match score:
 *
 * - Each application gets one confirmation. A confirmation pairs with a
 *   matching application that has none yet; when the match already has
 *   one, it's a second application to the same company.
 * - Progress (an assessment, an interview, an offer) dated after the
 *   matching application was closed is a new application, not a reopening;
 *   a rejection dated before the match's latest progress ended an earlier one.
 * - A company-only match counts when it's the only application there.
 *
 * The person's automation settings apply last: with automatic updates off,
 * nothing is applied or created without asking.
 */
export async function routeEmail(
  tx: Database,
  userId: string,
  signal: EmailSignal,
): Promise<EmailRoute> {
  if (
    !CLASSIFICATION_EVENTS[signal.classification] ||
    signal.confidence < CONFIDENCE_THRESHOLDS.review
  ) {
    return { action: "ignore", match: null };
  }

  const companyNameNorm = signal.companyName
    ? normalizeCompanyName(signal.companyName)
    : null;
  const candidates = await findMatchCandidates(tx, userId, {
    companyNameNorm,
    companyDomain: signal.companyDomain,
    platform: signal.platform,
    atsJobId: signal.atsJobId,
    threadId: signal.threadId,
  });
  const match = matchApplication(
    {
      companyNameNorm: companyNameNorm ?? "",
      companyDomain: signal.companyDomain,
      jobTitleNorm: signal.jobTitle ? normalizeJobTitle(signal.jobTitle) : null,
      platform: signal.platform,
      atsJobId: signal.atsJobId,
      threadId: signal.threadId,
      senderDomain: signal.fromEmail ? senderDomain(signal.fromEmail) : null,
      occurredAt: signal.receivedAt,
    },
    candidates,
  );

  const settings = await getEmailAutomation(userId, tx);
  const startOrAsk = (candidateId: string | null): EmailRoute =>
    settings.autoUpdateEnabled && canStartApplication(signal)
      ? { action: "create", match }
      : {
          action: "review",
          kind: candidateId ? "EMAIL_POSSIBLE_MATCH" : "EMAIL_UNMATCHED",
          candidateId,
          match,
        };

  if (match.decision === "NONE") {
    // An assessment is specific enough to start an application on its own;
    // interview requests and recruiter notes from unknown senders are asked about.
    return signal.classification === "APPLICATION_CONFIRMATION" ||
      signal.classification === "REJECTION" ||
      signal.classification === "ASSESSMENT"
      ? startOrAsk(null)
      : { action: "review", kind: "EMAIL_UNMATCHED", candidateId: null, match };
  }

  const best = match.best;
  const facts = await candidateFacts(tx, userId, best.candidateId);
  const titleConflict = best.signals.includes("DIFFERENT_TITLE");
  // The same posting or the same thread settles it whatever else is true.
  const certain = best.signals.some(
    (s) => s === "ATS_JOB_ID" || s === "SAME_THREAD",
  );
  let decision = match.decision;

  if (signal.classification === "APPLICATION_CONFIRMATION" && !certain) {
    if (facts.hasConfirmation || titleConflict)
      return startOrAsk(best.candidateId);
    decision = "AUTOMATIC";
  } else if (
    PROGRESS.has(signal.classification) &&
    !certain &&
    CLOSED.includes(facts.status) &&
    facts.closedAt !== null &&
    signal.receivedAt > facts.closedAt
  ) {
    // Progress after that application ended belongs to a new one.
    return startOrAsk(best.candidateId);
  } else if (
    signal.classification === "REJECTION" &&
    !certain &&
    facts.latestProgressAt !== null &&
    signal.receivedAt < facts.latestProgressAt
  ) {
    // A rejection from before that application moved forward ended an
    // earlier application, not this one.
    return startOrAsk(best.candidateId);
  } else if (
    decision === "POSSIBLE" &&
    !titleConflict &&
    (best.signals.includes("COMPANY_NAME") ||
      best.signals.includes("COMPANY_NAME_PARTIAL")) &&
    facts.applicationsAtCompany === 1 &&
    !CLOSED.includes(facts.status)
  ) {
    decision = "AUTOMATIC";
  }

  const automation = decideAutomation(
    {
      classification: signal.classification,
      confidence: signal.confidence,
      method: signal.method,
      match: decision,
    },
    settings,
  );
  if (automation === "NO_UPDATE") return { action: "ignore", match };
  if (automation === "AUTO_APPLY" || automation === "APPLY_FLAGGED") {
    return { action: "apply", applicationId: best.candidateId, match };
  }
  return {
    action: "review",
    kind:
      decision === "POSSIBLE"
        ? "EMAIL_POSSIBLE_MATCH"
        : "LOW_CONFIDENCE_UPDATE",
    candidateId: best.candidateId,
    match,
  };
}
