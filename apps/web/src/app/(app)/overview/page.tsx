import { BriefcaseBusiness } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddApplicationButton } from "@/components/applications/application-dialogs";
import {
  ViewToggle,
  type ApplicationsView,
} from "@/components/applications/view-toggle";
import { EmptyState } from "@/components/empty-state";
import { Greeting } from "@/components/overview/greeting";
import { IntegrationsCard } from "@/components/overview/integrations-card";
import {
  OverviewApplications,
  OverviewApplicationsSkeleton,
} from "@/components/overview/overview-applications";
import {
  OverviewFunnel,
  OverviewFunnelSkeleton,
} from "@/components/overview/overview-funnel";
import {
  OverviewMetrics,
  OverviewMetricsSkeleton,
} from "@/components/overview/overview-metrics";
import { UpNext, UpNextSkeleton } from "@/components/overview/up-next";
import {
  RecentAutomation,
  RecentAutomationSkeleton,
} from "@/components/overview/recent-automation";
import { requireUser } from "@/server/auth/session";
import { getAgenda } from "@/server/services/agenda";
import { getOverviewAnalytics } from "@/server/services/analytics";
import { countApplications } from "@/server/services/applications";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({
  searchParams,
}: PageProps<"/overview">) {
  const user = await requireUser();
  const view: ApplicationsView =
    (await searchParams).view === "table" ? "table" : "board";

  if ((await countApplications(user.id)) === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Greeting name={user.name} />
        <EmptyState
          icon={BriefcaseBusiness}
          title="No applications yet"
          description="Add an application to get started. Once Gmail and the browser extension are connected, Trackr will add and update them for you."
          action={<AddApplicationButton />}
        />
      </div>
    );
  }

  // One read feeds both the summary and the funnel; each streams on its own.
  const analytics = getOverviewAnalytics(user.id);

  return (
    <div className="flex flex-col gap-6">
      <Greeting name={user.name} />

      {/* What to do next comes before how it's going. */}
      <Suspense fallback={<UpNextSkeleton />}>
        <UpNext agenda={getAgenda(user.id)} />
      </Suspense>

      <Suspense fallback={<OverviewMetricsSkeleton />}>
        <OverviewMetrics analytics={analytics} />
      </Suspense>

      <section
        aria-labelledby="overview-applications"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 id="overview-applications" className="font-semibold">
              Applications
            </h2>
            <Link
              href="/applications"
              className="text-[0.8125rem] text-primary-text underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle view={view} />
            <AddApplicationButton />
          </div>
        </div>
        <Suspense key={view} fallback={<OverviewApplicationsSkeleton />}>
          <OverviewApplications userId={user.id} view={view} />
        </Suspense>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.25fr_1.25fr_1fr]">
        <Suspense fallback={<RecentAutomationSkeleton />}>
          <RecentAutomation userId={user.id} />
        </Suspense>
        <Suspense fallback={<OverviewFunnelSkeleton />}>
          <OverviewFunnel analytics={analytics} />
        </Suspense>
        <IntegrationsCard userId={user.id} isDemo={user.isDemo} />
      </div>
    </div>
  );
}
