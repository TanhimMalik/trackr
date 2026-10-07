import type { ApplicationStatus, CardSignal } from "@trackr/domain";
import Link from "next/link";
import { DateText } from "@/components/date-text";
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
  defaults: ApplicationFormDefaults;
};

export function ApplicationCard({
  item,
  showStatus,
  actions,
  href,
  className,
}: {
  item: BoardItem;
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
        "group/card relative rounded-lg border bg-card p-3 text-left transition-colors",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <CompanyAvatar name={item.companyName} domain={item.companyDomain} />
        <div className="min-w-0 flex-1">
          <p className="truncate leading-5 font-medium">
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
          <p className="truncate text-[0.8125rem] leading-5 text-muted-foreground">
            {item.jobTitle}
          </p>
        </div>
        {actions && <div className="relative z-10">{actions}</div>}
      </div>
      <div className="mt-2 space-y-1 pl-[2.625rem] text-xs text-muted-foreground">
        <p className="tabular-nums">
          {saved ? "Saved " : "Applied "}
          <DateText date={saved ? item.createdAt : item.appliedAt!} />
        </p>
        {item.signal && <SignalLine signal={item.signal} />}
        {showStatus && <StatusBadge status={item.status} />}
      </div>
    </div>
  );
}
