import {
  APPLICATION_SOURCE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  SOURCE_PLATFORM_LABELS,
} from "@trackr/domain";
import { notFound } from "next/navigation";
import { DateText } from "@/components/date-text";
import { formatSalary } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getApplication } from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";
import { ApplicationContacts } from "./application-contacts";
import { ApplicationDetailActions } from "./application-detail-actions";
import { ApplicationInterviews } from "./application-interviews";
import { ApplicationTimeline } from "./application-timeline";
import { CompanyAvatar } from "./company-avatar";
import { formDefaultsFor } from "./form-defaults";

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 sm:grid-cols-[8.5rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children ?? <Missing />}</dd>
    </div>
  );
}

const Missing = () => <span className="text-muted-foreground">—</span>;

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate text-primary-text underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

function displayUrl(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    return `${host.replace(/^www\./, "")}${pathname === "/" ? "" : pathname}`;
  } catch {
    return url;
  }
}

/**
 * Everything about one application: header and actions, facts, notes and the
 * timeline. Shared by the drawer and the full page.
 */
export async function ApplicationDetail({
  applicationId,
  variant,
}: {
  applicationId: string;
  variant: "drawer" | "page";
}) {
  const user = await requireUser();
  const detail = await getApplication(user.id, applicationId).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    },
  );
  const { application, events, resume, contacts, interviews } = detail;
  const salary = formatSalary(
    application.salaryMin,
    application.salaryMax,
    application.salaryCurrency,
  );

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <CompanyAvatar
            name={application.companyName}
            domain={application.companyDomain}
            className="size-11"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg leading-6 font-semibold tracking-tight">
              {application.companyName}
            </h2>
            <p className="truncate text-muted-foreground">
              {application.jobTitle}
            </p>
          </div>
        </div>
        <ApplicationDetailActions
          applicationId={application.id}
          status={application.currentStatus}
          defaults={formDefaultsFor(application)}
          variant={variant}
        />
      </header>

      <section aria-labelledby="details-heading">
        <h3 id="details-heading" className="sr-only">
          Details
        </h3>
        <dl className="divide-y rounded-xl border bg-card px-4">
          <Fact label="Applied">
            {application.appliedAt && <DateText date={application.appliedAt} />}
          </Fact>
          <Fact label="Last activity">
            <DateText date={application.lastActivityAt} relative />
          </Fact>
          <Fact label="Found through">
            {application.source &&
              APPLICATION_SOURCE_LABELS[application.source]}
          </Fact>
          <Fact label="Applied through">
            {SOURCE_PLATFORM_LABELS[application.sourcePlatform]}
          </Fact>
          <Fact label="Location">{application.location}</Fact>
          <Fact label="Employment type">
            {application.employmentType &&
              EMPLOYMENT_TYPE_LABELS[application.employmentType]}
          </Fact>
          <Fact label="Salary">{salary}</Fact>
          <Fact label="Job posting">
            {application.jobUrl && (
              <ExternalLink href={application.jobUrl}>
                {displayUrl(application.jobUrl)}
              </ExternalLink>
            )}
          </Fact>
          <Fact label="Company website">
            {application.companyDomain && (
              <ExternalLink href={`https://${application.companyDomain}`}>
                {application.companyDomain}
              </ExternalLink>
            )}
          </Fact>
          <Fact label="Resume">{resume?.name}</Fact>
        </dl>
      </section>

      <ApplicationInterviews
        applicationId={application.id}
        interviews={interviews}
        contacts={contacts.map(({ id, name }) => ({ id, name }))}
      />

      <ApplicationContacts applicationId={application.id} contacts={contacts} />

      {application.notes && (
        <section aria-labelledby="notes-heading" className="space-y-2">
          <h3 id="notes-heading" className="font-semibold">
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {application.notes}
          </p>
        </section>
      )}

      <section aria-labelledby="activity-heading" className="space-y-3">
        <h3 id="activity-heading" className="font-semibold">
          Activity
        </h3>
        <ApplicationTimeline events={events} />
      </section>
    </article>
  );
}
