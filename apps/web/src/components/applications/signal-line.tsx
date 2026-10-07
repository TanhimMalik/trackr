import type { CardSignal } from "@trackr/domain";
import {
  CalendarDays,
  CircleX,
  Compass,
  FileCode2,
  Mail,
  MessageSquare,
  Milestone,
  Puzzle,
  Send,
  Trophy,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const iconProps = { className: "size-3.5 shrink-0", "aria-hidden": true };

function SignalIcon({ signal }: { signal: CardSignal }) {
  if (signal.kind === "origin") {
    return signal.sourceType === "EMAIL" ? (
      <Mail {...iconProps} />
    ) : (
      <Puzzle {...iconProps} />
    );
  }
  if (signal.kind === "source") return <Compass {...iconProps} />;

  switch (signal.eventType) {
    case "ASSESSMENT_RECEIVED":
      return <FileCode2 {...iconProps} />;
    case "RECRUITER_CONTACT":
      return <MessageSquare {...iconProps} />;
    case "INTERVIEW_REQUESTED":
    case "INTERVIEW_SCHEDULED":
    case "INTERVIEW_RESCHEDULED":
      return <CalendarDays {...iconProps} />;
    case "OFFER_RECEIVED":
      return <Trophy {...iconProps} />;
    case "REJECTION_RECEIVED":
      return <CircleX {...iconProps} />;
    case "APPLICATION_WITHDRAWN":
      return <Undo2 {...iconProps} />;
    case "FOLLOW_UP_SENT":
      return <Send {...iconProps} />;
    case "NEXT_ROUND":
      return <Milestone {...iconProps} />;
  }
}

/** The card's one-line summary, with an icon for where it came from. */
export function SignalLine({
  signal,
  className,
}: {
  signal: CardSignal;
  className?: string;
}) {
  return (
    <p className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <SignalIcon signal={signal} />
      <span className="truncate">{signal.label}</span>
    </p>
  );
}
