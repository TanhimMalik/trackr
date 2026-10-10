import {
  APPLICATION_STATUS_LABELS,
  PLACEHOLDER_JOB_TITLE,
  type ApplicationStatus,
  type CardSignal,
} from "@trackr/domain";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { DateText, DateTimeText } from "@/components/date-text";
import { cn } from "@/lib/utils";
import type { ApplicationFormDefaults } from "./application-form";
import { CompanyAvatar } from "./company-avatar";
import { SignalLine } from "./signal-line";
import { StatusBadge } from "./status-badge";

/** What the board needs to draw and act on one application. */
export type BoardItem = {
  id: string;
  companyName: string;
  companyDomain: string | null;
  jobTitle: string;
  status: ApplicationStatus;
  appliedAt: Date | null;
  createdAt: Date;
  signal: CardSignal | null;
  /** The next scheduled interview still to come. */
  nextInterviewAt?: Date | null;
  defaults: ApplicationFormDefaults;
};

export function ApplicationCard({
  item,
  showStatus,
  actions,
  href,
  className,
}: {
  item: Omit<BoardItem, "defaults">;
  /** Shown in grouped columns, e.g. "Final round" inside Interview. */
  showStatus: boolean;
  actions?: React.ReactNode;
  /** Makes the whole card open the application. */
  href?: string;
  className?: string;
}) {
  const saved = item.status === "SAVED" || !item.appliedAt;

  return (
    <div
      className={cn(
        "group/card relative rounded-lg border bg-card p-3 text-left shadow-xs transition-colors motion-reduce:transition-none",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <CompanyAvatar name={item.companyName} domain={item.companyDomain} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate leading-5 font-medium",
              // Room for the actions button, which sits over the corner.
              actions && "pr-6",
            )}
          >
            {href ? (
              // Stretched over the card; native link dragging is off so the
              // board's own drag and drop keeps working.
              <Link
                href={href}
                draggable={false}
                className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
              >
                {item.companyName}
              </Link>
            ) : (
              item.companyName
            )}
          </p>
          <p
            className={cn(
              "line-clamp-2 text-[0.8125rem] leading-5 break-words",
              // A step above the metadata; a role the email didn't name, below it.
              item.jobTitle === PLACEHOLDER_JOB_TITLE
                ? "text-muted-foreground italic"
                : "text-foreground/80",
            )}
          >
            {item.jobTitle}
          </p>
        </div>
        {actions && (
          <div className="absolute top-2 right-2 z-10">{actions}</div>
        )}
      </div>
      <div className="mt-2 space-y-1 pl-[2.625rem] text-xs text-muted-foreground">
        <p className="tabular-nums">
          {saved ? "Saved " : "Applied "}
          <DateText date={saved ? item.createdAt : item.appliedAt!} />
        </p>
        {item.nextInterviewAt && (
          <p className="flex items-center gap-1.5 font-medium text-foreground/80">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">Next interview:</span>
            <DateTimeText date={item.nextInterviewAt} withZone />
          </p>
        )}
        {item.signal && <SignalLine signal={item.signal} />}
        {/* Skip the status when the signal already says it ("Final round"). */}
        {showStatus &&
          item.signal?.label !== APPLICATION_STATUS_LABELS[item.status] && (
            <StatusBadge status={item.status} />
          )}
      </div>
    </div>
  );
}
