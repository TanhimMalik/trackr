import type { ApplicationEventType, EventSourceType } from "@trackr/domain";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CircleCheck,
  CircleX,
  FileCode2,
  Mail,
  MessageSquare,
  Milestone,
  Pencil,
  Puzzle,
  Send,
  Settings2,
  Trophy,
  Undo2,
  Upload,
} from "lucide-react";
import { StatusDot } from "@/components/applications/status-badge";
import { DateText } from "@/components/date-text";
import {
  describeEvent,
  eventActionFor,
  type TimelineEvent,
} from "@/lib/applications/timeline";
import { cn } from "@/lib/utils";
import { APPLICATION_STATUS_LABELS } from "@trackr/domain";
import { TimelineEventAction } from "./timeline-event-action";

const iconProps = { className: "size-3.5", "aria-hidden": true };

export function EventIcon({ type }: { type: ApplicationEventType }) {
  switch (type) {
    case "JOB_SAVED":
      return <Bookmark {...iconProps} />;
    case "APPLICATION_SUBMITTED":
      return <Upload {...iconProps} />;
    case "APPLICATION_CONFIRMATION_RECEIVED":
      return <CircleCheck {...iconProps} />;
    case "ASSESSMENT_RECEIVED":
      return <FileCode2 {...iconProps} />;
    case "RECRUITER_CONTACT":
      return <MessageSquare {...iconProps} />;
    case "INTERVIEW_REQUESTED":
    case "INTERVIEW_SCHEDULED":
    case "INTERVIEW_RESCHEDULED":
      return <CalendarDays {...iconProps} />;
    case "NEXT_ROUND":
      return <Milestone {...iconProps} />;
    case "OFFER_RECEIVED":
      return <Trophy {...iconProps} />;
    case "REJECTION_RECEIVED":
      return <CircleX {...iconProps} />;
    case "APPLICATION_WITHDRAWN":
      return <Undo2 {...iconProps} />;
    case "FOLLOW_UP_SENT":
      return <Send {...iconProps} />;
    case "STATUS_OVERRIDDEN":
      return <Pencil {...iconProps} />;
  }
}

export function SourceIcon({ source }: { source: EventSourceType }) {
  const props = { className: "size-3", "aria-hidden": true };
  switch (source) {
    case "EMAIL":
      return <Mail {...props} />;
    case "BROWSER_EXTENSION":
      return <Puzzle {...props} />;
    case "MANUAL":
      return <Pencil {...props} />;
    case "SYSTEM":
      return <Settings2 {...props} />;
  }
}

export const chip =
  "inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs text-muted-foreground";

export type TimelineItem = TimelineEvent & {
  id: string;
  eventTimestamp: Date;
};

/**
 * An application's history in the order it happened, built from its events.
 * Automatic entries say where they came from and how confident Trackr was.
 */
export function ApplicationTimeline({ events }: { events: TimelineItem[] }) {
  if (events.length === 0) {
    return <p className="text-muted-foreground">No activity yet.</p>;
  }

  const activeEvents = events.filter((event) => !event.revertedAt).length;

  return (
    <ol className="relative space-y-4 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:bg-border">
      {events.map((event) => {
        const entry = describeEvent(event);
        const action = eventActionFor(event, activeEvents);
        return (
          <li key={event.id} className="group/event relative flex gap-3">
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
              <EventIcon type={event.eventType} />
            </span>
            <div
              className={cn(
                "min-w-0 flex-1 pt-0.5",
                entry.reverted && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p
                  className={cn(
                    "font-medium",
                    entry.reverted && "line-through",
                  )}
                >
                  {entry.title}
                </p>
                <DateText
                  date={event.eventTimestamp}
                  className="text-xs text-muted-foreground tabular-nums"
                />
              </div>
              {entry.detail && (
                <p className="text-muted-foreground">{entry.detail}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={chip}>
                  <SourceIcon source={event.sourceType} />
                  {entry.source.label}
                  {entry.source.confidence !== null &&
                    ` · ${entry.source.confidence}%`}
                </span>
                {entry.source.aiClassified && (
                  <span
                    className={chip}
                    title="Classified by the language model"
                  >
                    AI
                  </span>
                )}
                {entry.transition && (
                  <span className={chip}>
                    <StatusDot status={entry.transition.from} />
                    {APPLICATION_STATUS_LABELS[entry.transition.from]}
                    <ArrowRight className="size-3" aria-label="to" />
                    <StatusDot status={entry.transition.to} />
                    {APPLICATION_STATUS_LABELS[entry.transition.to]}
                  </span>
                )}
                {entry.reverted && <span className={chip}>Undone</span>}
                {action && (
                  <div
                    className={cn(
                      "ml-auto",
                      // With a mouse, Undo appears on hover or focus; on touch
                      // screens it stays visible. Restore always shows.
                      action === "undo" &&
                        "pointer-fine:opacity-0 pointer-fine:group-focus-within/event:opacity-100 pointer-fine:group-hover/event:opacity-100",
                    )}
                  >
                    <TimelineEventAction
                      eventId={event.id}
                      action={action}
                      label={entry.title}
                    />
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
