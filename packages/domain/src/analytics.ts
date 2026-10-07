import type { ApplicationEventType, ApplicationStatus } from "./enums";

/**
 * Metric definitions shared by the summary metrics, the funnel and the
 * analytics page, so every surface computes the same numbers.
 */

/** Company-originated events. The automatic application confirmation is not a response. */
export const RESPONSE_EVENT_TYPES = [
  "ASSESSMENT_RECEIVED",
  "RECRUITER_CONTACT",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_RESCHEDULED",
  "NEXT_ROUND",
  "OFFER_RECEIVED",
  "REJECTION_RECEIVED",
] as const satisfies readonly ApplicationEventType[];

const RESPONSE_EVENTS: ReadonlySet<ApplicationEventType> = new Set(
  RESPONSE_EVENT_TYPES,
);

/** Statuses that can only be reached after the company responded. */
export const RESPONSE_STATUSES = [
  "ASSESSMENT",
  "RECRUITER_SCREEN",
  "INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
  "REJECTED",
] as const satisfies readonly ApplicationStatus[];

const RESPONSE_STATUS_SET: ReadonlySet<ApplicationStatus> = new Set(
  RESPONSE_STATUSES,
);

// Later stages imply earlier ones, so the funnel stays nested.
const INTERVIEW_STAGES: ReadonlySet<ApplicationStatus> = new Set([
  "INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
]);
const FINAL_ROUND_STAGES: ReadonlySet<ApplicationStatus> = new Set([
  "FINAL_ROUND",
  "OFFER",
]);
const OFFER_STAGES: ReadonlySet<ApplicationStatus> = new Set(["OFFER"]);

/** An active (non-reverted) event with the status it produced. */
export type ProgressEvent = {
  type: ApplicationEventType;
  occurredAt: Date;
  statusAfter: ApplicationStatus | null;
};

export type ApplicationProgress = {
  appliedAt: Date | null;
  firstResponseAt: Date | null;
  reachedInterview: boolean;
  reachedFinalRound: boolean;
  reachedOffer: boolean;
  rejected: boolean;
};

function isResponse(event: ProgressEvent): boolean {
  if (RESPONSE_EVENTS.has(event.type)) return true;
  // A manual move to a response status (for example, dragging a card to
  // Interview) means the company responded even if no email was captured.
  return (
    event.type === "STATUS_OVERRIDDEN" &&
    event.statusAfter !== null &&
    RESPONSE_STATUS_SET.has(event.statusAfter)
  );
}

/** Summarizes how far one application progressed, based on its event history. */
export function summarizeProgress({
  appliedAt,
  currentStatus,
  events,
}: {
  appliedAt: Date | null;
  currentStatus: ApplicationStatus;
  events: readonly ProgressEvent[];
}): ApplicationProgress {
  const reached = (stages: ReadonlySet<ApplicationStatus>) =>
    stages.has(currentStatus) ||
    events.some(
      (event) => event.statusAfter !== null && stages.has(event.statusAfter),
    );

  let firstResponseAt: Date | null = null;
  for (const event of events) {
    if (!isResponse(event)) continue;
    if (firstResponseAt === null || event.occurredAt < firstResponseAt) {
      firstResponseAt = event.occurredAt;
    }
  }

  return {
    appliedAt,
    firstResponseAt,
    reachedInterview: reached(INTERVIEW_STAGES),
    reachedFinalRound: reached(FINAL_ROUND_STAGES),
    reachedOffer: reached(OFFER_STAGES),
    rejected: currentStatus === "REJECTED",
  };
}

export type Funnel = {
  applications: number;
  responses: number;
  interviews: number;
  finalRounds: number;
  offers: number;
};

export function computeFunnel(
  progress: readonly ApplicationProgress[],
): Funnel {
  return {
    applications: progress.length,
    responses: progress.filter((p) => p.firstResponseAt !== null).length,
    interviews: progress.filter((p) => p.reachedInterview).length,
    finalRounds: progress.filter((p) => p.reachedFinalRound).length,
    offers: progress.filter((p) => p.reachedOffer).length,
  };
}

/** numerator ÷ denominator, or null when there is nothing to divide by. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export type Rates = {
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  rejectionRate: number | null;
};

export function computeRates(progress: readonly ApplicationProgress[]): Rates {
  const funnel = computeFunnel(progress);
  const rejected = progress.filter((p) => p.rejected).length;
  return {
    responseRate: ratio(funnel.responses, funnel.applications),
    interviewRate: ratio(funnel.interviews, funnel.applications),
    offerRate: ratio(funnel.offers, funnel.applications),
    rejectionRate: ratio(rejected, funnel.applications),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mean days from applying to the first response, over applications that got one. */
export function averageDaysToResponse(
  progress: readonly ApplicationProgress[],
): number | null {
  const durations = progress.flatMap(({ appliedAt, firstResponseAt }) => {
    if (!appliedAt || !firstResponseAt) return [];
    const days = (firstResponseAt.getTime() - appliedAt.getTime()) / DAY_MS;
    return days >= 0 ? [days] : [];
  });
  if (durations.length === 0) return null;
  return durations.reduce((sum, days) => sum + days, 0) / durations.length;
}

/** Relative change for counts, e.g. 0.12 for +12%. Null when there is no baseline. */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

/** Change between two rates in percentage points, e.g. 6 for 18% → 24%. */
export function percentagePointChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  return (current - previous) * 100;
}
