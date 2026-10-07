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
  /** When an event first moved it into an interview stage. */
  interviewAt: Date | null;
  /** When an event first moved it to Offer. */
  offerAt: Date | null;
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
/**
 * How far along each open status is, for spotting manual corrections. Closed
 * statuses have no place in the order: closing an application is not a step
 * back. Shared with the SQL behind the "Responded" filter.
 */
export const STATUS_PROGRESS_RANK: Partial<Record<ApplicationStatus, number>> =
  {
    SAVED: 0,
    APPLIED: 1,
    ASSESSMENT: 2,
    RECRUITER_SCREEN: 2,
    INTERVIEW: 3,
    FINAL_ROUND: 4,
    OFFER: 5,
  };

/**
 * Leaves out manual status changes the person later took back: a move that a
 * later manual move undoes by going back a stage, or a closing that is later
 * reopened. A card dragged to Interview by mistake and straight back is not
 * an interview.
 */
function withoutCorrections(events: readonly ProgressEvent[]): ProgressEvent[] {
  const manual = events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.type === "STATUS_OVERRIDDEN" && event.statusAfter !== null,
    )
    .sort(
      (a, b) =>
        a.event.occurredAt.getTime() - b.event.occurredAt.getTime() ||
        a.index - b.index,
    );

  const corrected = new Set<ProgressEvent>();
  manual.forEach(({ event }, position) => {
    const rank = STATUS_PROGRESS_RANK[event.statusAfter!];
    const undone = manual.slice(position + 1).some(({ event: later }) => {
      const laterRank = STATUS_PROGRESS_RANK[later.statusAfter!];
      if (laterRank === undefined) return false;
      return rank === undefined || laterRank < rank;
    });
    if (undone) corrected.add(event);
  });

  return events.filter((event) => !corrected.has(event));
}

export function summarizeProgress({
  appliedAt,
  currentStatus,
  events: allEvents,
}: {
  appliedAt: Date | null;
  currentStatus: ApplicationStatus;
  events: readonly ProgressEvent[];
}): ApplicationProgress {
  const events = withoutCorrections(allEvents);
  const earliest = (matches: (event: ProgressEvent) => boolean) => {
    let at: Date | null = null;
    for (const event of events) {
      if (matches(event) && (at === null || event.occurredAt < at)) {
        at = event.occurredAt;
      }
    }
    return at;
  };
  const firstReached = (stages: ReadonlySet<ApplicationStatus>) =>
    earliest(
      (event) => event.statusAfter !== null && stages.has(event.statusAfter),
    );

  const interviewAt = firstReached(INTERVIEW_STAGES);
  const offerAt = firstReached(OFFER_STAGES);

  return {
    appliedAt,
    firstResponseAt: earliest(isResponse),
    reachedInterview:
      INTERVIEW_STAGES.has(currentStatus) || interviewAt !== null,
    reachedFinalRound:
      FINAL_ROUND_STAGES.has(currentStatus) ||
      firstReached(FINAL_ROUND_STAGES) !== null,
    reachedOffer: OFFER_STAGES.has(currentStatus) || offerAt !== null,
    interviewAt,
    offerAt,
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
