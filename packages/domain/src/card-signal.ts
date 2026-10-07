import type {
  ApplicationEventType,
  ApplicationSource,
  EventSourceType,
} from "./enums";
import { APPLICATION_SOURCE_LABELS } from "./labels";

const SIGNAL_EVENT_LABELS = {
  ASSESSMENT_RECEIVED: "Assessment received",
  RECRUITER_CONTACT: "Recruiter reached out",
  INTERVIEW_REQUESTED: "Interview requested",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_RESCHEDULED: "Interview rescheduled",
  NEXT_ROUND: "Next round",
  OFFER_RECEIVED: "Offer received",
  REJECTION_RECEIVED: "Rejection received",
  APPLICATION_WITHDRAWN: "Withdrawn",
  FOLLOW_UP_SENT: "Followed up",
} satisfies Partial<Record<ApplicationEventType, string>>;

export type CardSignalEventType = keyof typeof SIGNAL_EVENT_LABELS;

/**
 * Event types informative enough to summarize a card. Queries load the latest
 * active event of one of these types for each application.
 */
export const CARD_SIGNAL_EVENT_TYPES = Object.keys(
  SIGNAL_EVENT_LABELS,
) as CardSignalEventType[];

const ORIGIN_LABELS = {
  EMAIL: "Gmail detected",
  BROWSER_EXTENSION: "Captured by extension",
} satisfies Partial<Record<EventSourceType, string>>;

export type CardSignal =
  | { kind: "event"; eventType: CardSignalEventType; label: string }
  | { kind: "origin"; sourceType: keyof typeof ORIGIN_LABELS; label: string }
  | { kind: "source"; source: ApplicationSource; label: string };

export type CardSignalInput = {
  /** Latest active event whose type is in CARD_SIGNAL_EVENT_TYPES. */
  latestSignalEvent: {
    type: CardSignalEventType;
    metadata?: { isFinalRound?: boolean };
  } | null;
  /** The event that created the application. */
  originEvent: { sourceType: EventSourceType } | null;
  /** Where the user found the job. */
  source: ApplicationSource | null;
};

/**
 * The one-line summary shown on a board card: the most informative recent
 * event, otherwise how the application was captured, otherwise its source.
 */
export function cardSignal({
  latestSignalEvent,
  originEvent,
  source,
}: CardSignalInput): CardSignal | null {
  if (latestSignalEvent) {
    const { type, metadata } = latestSignalEvent;
    const label =
      type === "NEXT_ROUND" && metadata?.isFinalRound
        ? "Final round"
        : SIGNAL_EVENT_LABELS[type];
    return { kind: "event", eventType: type, label };
  }

  const originSource = originEvent?.sourceType;
  if (originSource === "EMAIL" || originSource === "BROWSER_EXTENSION") {
    return {
      kind: "origin",
      sourceType: originSource,
      label: ORIGIN_LABELS[originSource],
    };
  }

  if (source) {
    return { kind: "source", source, label: APPLICATION_SOURCE_LABELS[source] };
  }

  return null;
}
