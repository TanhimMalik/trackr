import { APPLICATION_SOURCE_LABELS } from "@trackr/domain";
import { DateText } from "@/components/date-text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Application } from "@/server/db/types";
import { ApplicationRowActions } from "./application-row-actions";
import type { ApplicationFormDefaults } from "./application-form";
import { CompanyAvatar } from "./company-avatar";
import { StatusBadge } from "./status-badge";

function formDefaults(application: Application): ApplicationFormDefaults {
  return {
    companyName: application.companyName,
    companyDomain: application.companyDomain,
    jobTitle: application.jobTitle,
    jobUrl: application.jobUrl,
    location: application.location,
    employmentType: application.employmentType,
    salaryMin: application.salaryMin,
    salaryMax: application.salaryMax,
    salaryCurrency: application.salaryCurrency,
    source: application.source,
    sourcePlatform: application.sourcePlatform,
    notes: application.notes,
  };
}

const muted = <span className="text-muted-foreground">—</span>;

export function ApplicationsTable({
  applications,
}: {
  applications: Application[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-full pl-4">Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Applied</TableHead>
            <TableHead className="hidden md:table-cell">
              Last activity
            </TableHead>
            <TableHead className="hidden lg:table-cell">
              Found through
            </TableHead>
            <TableHead className="hidden xl:table-cell">Location</TableHead>
            <TableHead className="w-12 pr-3">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((application) => (
            <TableRow key={application.id}>
              {/* max-w-0 lets this column shrink so long names truncate on small screens. */}
              <TableCell className="w-full max-w-0 py-2 pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <CompanyAvatar
                    name={application.companyName}
                    domain={application.companyDomain}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {application.companyName}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {application.jobTitle}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={application.currentStatus} />
              </TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                {application.appliedAt ? (
                  <DateText date={application.appliedAt} />
                ) : (
                  muted
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                <DateText date={application.lastActivityAt} relative />
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {application.source
                  ? APPLICATION_SOURCE_LABELS[application.source]
                  : muted}
              </TableCell>
              <TableCell className="hidden max-w-48 truncate text-muted-foreground xl:table-cell">
                {application.location ?? muted}
              </TableCell>
              <TableCell className="pr-3 text-right">
                <ApplicationRowActions
                  applicationId={application.id}
                  defaults={formDefaults(application)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
