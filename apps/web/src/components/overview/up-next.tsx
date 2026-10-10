import { INTERVIEW_TYPE_LABELS } from "@trackr/domain";
import { CalendarClock, Inbox, Send } from "lucide-react";
import Link from "next/link";
import { DateText, DateTimeText } from "@/components/date-text";
import { Skeleton } from "@/components/ui/skeleton";
import type { Agenda } from "@/server/services/agenda";
import { SectionCard } from "./section-card";

function Row({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
        <span className="min-w-0 flex-1">{children}</span>
      </Link>
    </li>
  );
}

/** The next things to act on, above the statistics. */
export async function UpNext({ agenda }: { agenda: Promise<Agenda> }) {
  const { interviews, followUps, reviews } = await agenda;
  const empty = interviews.length === 0 && followUps.length === 0 && !reviews;

  return (
    <SectionCard id="up-next" title="Up next">
      {empty ? (
        <p className="pb-4 text-muted-foreground">
          Nothing scheduled. Upcoming interviews, follow-ups that are due and
          emails to review will show up here.
        </p>
      ) : (
        <ul className="flex flex-col pb-2">
          {interviews.map((interview) => (
            <Row
              key={`${interview.applicationId}-${interview.at.toISOString()}`}
              href={`/applications/${interview.applicationId}`}
              icon={<CalendarClock aria-hidden="true" />}
            >
              <span className="block truncate font-medium">
                {INTERVIEW_TYPE_LABELS[interview.interviewType]} ·{" "}
                {interview.companyName}
              </span>
              <span className="block text-[0.8125rem] text-muted-foreground">
                <DateTimeText date={interview.at} withZone /> ·{" "}
                {interview.jobTitle}
              </span>
            </Row>
          ))}
          {followUps.map((followUp) => (
            <Row
              key={followUp.applicationId}
              href={`/applications/${followUp.applicationId}`}
              icon={<Send aria-hidden="true" />}
            >
              <span className="block truncate font-medium">
                Follow up with {followUp.companyName}
              </span>
              <span className="block text-[0.8125rem] text-muted-foreground">
                No reply yet · reminded{" "}
                <DateText date={followUp.remindedAt} relative />
              </span>
            </Row>
          ))}
          {reviews > 0 && (
            <Row
              href="/activity?tab=review"
              icon={<Inbox aria-hidden="true" />}
            >
              <span className="block font-medium">
                {reviews === 1
                  ? "1 item to review"
                  : `${reviews} items to review`}
              </span>
              <span className="block text-[0.8125rem] text-muted-foreground">
                Trackr wasn&apos;t sure and is asking you
              </span>
            </Row>
          )}
        </ul>
      )}
    </SectionCard>
  );
}

export function UpNextSkeleton() {
  return (
    <SectionCard id="up-next" title="Up next">
      <div className="flex flex-col gap-3 pb-4" role="status" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </SectionCard>
  );
}
