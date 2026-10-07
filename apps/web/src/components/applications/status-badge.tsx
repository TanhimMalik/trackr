import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@trackr/domain";
import { cn } from "@/lib/utils";

// Static class names so Tailwind can see them.
const STATUS_DOT: Record<ApplicationStatus, string> = {
  SAVED: "bg-status-neutral",
  APPLIED: "bg-status-applied",
  ASSESSMENT: "bg-status-assessment",
  RECRUITER_SCREEN: "bg-status-interview",
  INTERVIEW: "bg-status-interview",
  FINAL_ROUND: "bg-status-final",
  OFFER: "bg-status-offer",
  REJECTED: "bg-status-rejected",
  WITHDRAWN: "bg-status-withdrawn",
  UNKNOWN: "bg-status-neutral",
};

export function StatusDot({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        STATUS_DOT[status],
        className,
      )}
    />
  );
}

/** A status label with its colored dot. The label, not the color, carries the meaning. */
export function StatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <StatusDot status={status} />
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
