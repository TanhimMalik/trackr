import type {
  ApplicationEventType,
  ApplicationStatus,
  EventSourceType,
} from "./enums";

/** Statuses that automation never moves an application out of. */
export const FINAL_STATUSES = [
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const satisfies readonly ApplicationStatus[];
export type FinalStatus = (typeof FINAL_STATUSES)[number];
export type PipelineStatus = Exclude<ApplicationStatus, FinalStatus>;

export function isFinalStatus(
  status: ApplicationStatus,
): status is FinalStatus {
  return (FINAL_STATUSES as readonly ApplicationStatus[]).includes(status);
}

/** Pipeline order. Equal ranks allow lateral moves (assessment ↔ recruiter screen). */
const PIPELINE_RANK: Record<PipelineStatus, number> = {
  UNKNOWN: 0,
  SAVED: 1,
  APPLIED: 2,
  ASSESSMENT: 3,
  RECRUITER_SCREEN: 3,
  INTERVIEW: 4,
  FINAL_ROUND: 5,
};

/** The subset of an event that status derivation depends on. */
export type StatusEvent = {
  id: string;
  type: ApplicationEventType;
  /** When it happened in the world (email date, submission time). */
  occurredAt: Date;
  /** When Trackr recorded it. Breaks ties between events at the same time. */
  recordedAt: Date;
  sourceType: EventSourceType;
  metadata?: { isFinalRound?: boolean; toStatus?: ApplicationStatus };
  revertedAt?: Date | null;
};

export type StatusTransition = {
  eventId: string;
  before: ApplicationStatus;
  after: ApplicationStatus;
};

export type DerivedApplicationState = {
  status: ApplicationStatus;
  appliedAt: Date | null;
  lastActivityAt: Date | null;
  /** One entry per active event, in replay order. Reverted events are omitted. */
  transitions: StatusTransition[];
};

/** The status an event points toward, or null if it never changes status. */
export function targetStatus(event: StatusEvent): ApplicationStatus | null {
  switch (event.type) {
    case "JOB_SAVED":
      return "SAVED";
    case "APPLICATION_SUBMITTED":
    case "APPLICATION_CONFIRMATION_RECEIVED":
      return "APPLIED";
    case "ASSESSMENT_RECEIVED":
      return "ASSESSMENT";
    case "RECRUITER_CONTACT":
      return "RECRUITER_SCREEN";
    case "INTERVIEW_REQUESTED":
    case "INTERVIEW_SCHEDULED":
    case "INTERVIEW_RESCHEDULED":
    case "NEXT_ROUND":
      return event.metadata?.isFinalRound ? "FINAL_ROUND" : "INTERVIEW";
    case "OFFER_RECEIVED":
      return "OFFER";
    case "REJECTION_RECEIVED":
      return "REJECTED";
    case "APPLICATION_WITHDRAWN":
      return "WITHDRAWN";
    case "FOLLOW_UP_SENT":
      return null;
    case "STATUS_OVERRIDDEN":
      return event.metadata?.toStatus ?? null;
  }
}

/** Applies one event to the current status. */
export function transition(
  current: ApplicationStatus,
  event: StatusEvent,
): ApplicationStatus {
  const target = targetStatus(event);
  if (target === null) return current;

  // An explicit status change by the user always wins.
  if (event.type === "STATUS_OVERRIDDEN") return target;

  // Final statuses only change through the user's own actions.
  if (isFinalStatus(current)) {
    return event.sourceType === "MANUAL" ? target : current;
  }

  // Offers, rejections and withdrawals apply from any active status.
  if (isFinalStatus(target)) return target;

  // Otherwise the pipeline only moves forward.
  return PIPELINE_RANK[target] >= PIPELINE_RANK[current] ? target : current;
}

/** Orders events by when they happened, then when they were recorded, then id. */
export function compareStatusEvents(a: StatusEvent, b: StatusEvent): number {
  return (
    a.occurredAt.getTime() - b.occurredAt.getTime() ||
    a.recordedAt.getTime() - b.recordedAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Derives an application's state by replaying its active events in the order
 * they happened. Arrival order does not matter, so a late "application
 * received" email cannot move an interviewing application back to Applied.
 */
export function deriveApplicationState(
  events: readonly StatusEvent[],
): DerivedApplicationState {
  const active = events
    .filter((event) => !event.revertedAt)
    .sort(compareStatusEvents);

  let status: ApplicationStatus = "UNKNOWN";
  let appliedAt: Date | null = null;
  const transitions: StatusTransition[] = [];

  for (const event of active) {
    const before = status;
    status = transition(status, event);
    transitions.push({ eventId: event.id, before, after: status });

    const isSubmission =
      event.type === "APPLICATION_SUBMITTED" ||
      event.type === "APPLICATION_CONFIRMATION_RECEIVED";
    if (isSubmission && appliedAt === null) appliedAt = event.occurredAt;
  }

  return {
    status,
    appliedAt,
    lastActivityAt: active.at(-1)?.occurredAt ?? null,
    transitions,
  };
}
