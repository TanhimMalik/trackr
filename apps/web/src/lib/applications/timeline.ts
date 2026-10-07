import {
  APPLICATION_EVENT_LABELS,
  APPLICATION_STATUS_LABELS,
  applicationStatusSchema,
  EVENT_SOURCE_LABELS,
  INTERVIEW_TYPE_LABELS,
  interviewTypeSchema,
  type ApplicationEventType,
  type ApplicationStatus,
  type ClassificationMethod,
  type EventSourceType,
} from "@trackr/domain";

export type TimelineEvent = {
  eventType: ApplicationEventType;
  sourceType: EventSourceType;
  classificationMethod: ClassificationMethod | null;
  confidence: number | null;
  metadata: Record<string, unknown>;
  statusBefore: ApplicationStatus | null;
  statusAfter: ApplicationStatus | null;
  revertedAt: Date | null;
};

export type TimelineEntry = {
  title: string;
  /** Extra context, such as the kind of interview. */
  detail: string | null;
  /** The status change this event caused, if any. */
  transition: { from: ApplicationStatus; to: ApplicationStatus } | null;
  source: {
    label: string;
    /** Recorded by Trackr rather than by the person. */
    automatic: boolean;
    /** Classified by the language model rather than by rules. */
    aiClassified: boolean;
    /** Whole percent, for automatic events. */
    confidence: number | null;
  };
  reverted: boolean;
};

const INTERVIEW_EVENTS: ReadonlySet<ApplicationEventType> = new Set([
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_RESCHEDULED",
]);

function title(event: TimelineEvent): string {
  if (event.eventType === "STATUS_OVERRIDDEN") {
    const target = applicationStatusSchema.safeParse(event.metadata.toStatus);
    const status = target.success ? target.data : event.statusAfter;
    return status
      ? `Status changed to ${APPLICATION_STATUS_LABELS[status]}`
      : APPLICATION_EVENT_LABELS.STATUS_OVERRIDDEN;
  }
  if (
    event.eventType === "NEXT_ROUND" &&
    event.metadata.isFinalRound === true
  ) {
    return "Moved to the final round";
  }
  return APPLICATION_EVENT_LABELS[event.eventType];
}

function detail(event: TimelineEvent): string | null {
  if (!INTERVIEW_EVENTS.has(event.eventType)) return null;
  const kind = interviewTypeSchema.safeParse(event.metadata.interviewKind);
  return kind.success ? INTERVIEW_TYPE_LABELS[kind.data] : null;
}

/** How one event reads in an application's timeline. */
export function describeEvent(event: TimelineEvent): TimelineEntry {
  const { statusBefore: from, statusAfter: to } = event;
  // The first event moves out of Unknown, which says nothing useful.
  const transition =
    from && to && from !== to && from !== "UNKNOWN" ? { from, to } : null;
  const automatic = event.sourceType !== "MANUAL";

  return {
    title: title(event),
    detail: detail(event),
    transition,
    source: {
      label: EVENT_SOURCE_LABELS[event.sourceType],
      automatic,
      aiClassified: event.classificationMethod === "LLM",
      confidence:
        automatic && event.confidence !== null
          ? Math.round(event.confidence * 100)
          : null,
    },
    reverted: event.revertedAt !== null,
  };
}

/**
 * What the timeline offers for an event: undo while it counts, restore once
 * undone. The last active event can't be undone, so an application always
 * keeps some history.
 */
export function eventActionFor(
  event: Pick<TimelineEvent, "revertedAt">,
  activeEvents: number,
): "undo" | "restore" | null {
  if (event.revertedAt) return "restore";
  return activeEvents > 1 ? "undo" : null;
}
