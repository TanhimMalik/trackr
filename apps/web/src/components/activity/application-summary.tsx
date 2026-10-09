import Link from "next/link";
import { CompanyAvatar } from "@/components/applications/company-avatar";
import { StatusBadge } from "@/components/applications/status-badge";
import { DateText } from "@/components/date-text";
import type { ReviewApplication } from "@/server/services/review";

/** An application in a review card, linking to its details. */
export function ApplicationSummary({
  label,
  application,
}: {
  label: string;
  application: ReviewApplication;
}) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-2 rounded-lg border bg-background p-3 has-[a:hover]:bg-muted/40">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex items-center gap-3">
        <CompanyAvatar
          name={application.companyName}
          domain={application.companyDomain}
        />
        <div className="min-w-0">
          <Link
            href={`/applications/${application.id}`}
            className="block truncate font-medium outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {application.companyName}
          </Link>
          <p className="truncate text-muted-foreground">
            {application.jobTitle}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
        <StatusBadge status={application.status} />
        {application.appliedAt && (
          <span>
            Applied <DateText date={application.appliedAt} />
          </span>
        )}
      </div>
    </div>
  );
}
