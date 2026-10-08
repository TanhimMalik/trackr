import { APPLICATION_STATUS_LABELS } from "@trackr/domain";
import Link from "next/link";
import { CompanyAvatar } from "@/components/applications/company-avatar";
import { DateText } from "@/components/date-text";
import { describeEvent } from "@/lib/applications/timeline";
import { listRecentAutomation } from "@/server/services/activity";
import { SectionCard, SectionCardSkeleton } from "./section-card";

const ID = "recent-automation";
const TITLE = "Recent automation";

/**
 * The latest updates Trackr made on its own, each linking to its
 * application. The dot says what happened to the update: green means it was
 * applied automatically.
 */
export async function RecentAutomation({ userId }: { userId: string }) {
  const items = await listRecentAutomation(userId);

  return (
    <SectionCard
      id={ID}
      title={TITLE}
      action={
        <Link
          href="/activity?source=automatic"
          className="text-[0.8125rem] text-primary-text underline-offset-4 hover:underline"
        >
          View all
        </Link>
      }
    >
      {items.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">
          Updates Trackr detects in Gmail and from the browser extension will
          appear here.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((item) => {
            const entry = describeEvent(item);
            const details = [
              entry.transition &&
                `${APPLICATION_STATUS_LABELS[entry.transition.from]} → ${APPLICATION_STATUS_LABELS[entry.transition.to]}`,
              entry.source.confidence === null
                ? entry.source.label
                : `${entry.source.label} · ${entry.source.confidence}%`,
            ].filter(Boolean);

            return (
              <li key={item.id}>
                <Link
                  href={`/applications/${item.application.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <CompanyAvatar
                    name={item.application.companyName}
                    domain={item.application.companyDomain}
                    className="size-7"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium">
                        {item.application.companyName}
                      </span>
                      <span className="text-muted-foreground"> · </span>
                      {entry.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {details.join(" · ")} ·{" "}
                      <DateText date={item.eventTimestamp} relative />
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    title="Applied automatically"
                    className="size-2 shrink-0 rounded-full bg-success"
                  />
                  <span className="sr-only">Applied automatically</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export function RecentAutomationSkeleton() {
  return <SectionCardSkeleton id={ID} title={TITLE} rows={5} />;
}
