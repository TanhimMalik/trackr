import type { CountMetric } from "@trackr/domain";
import {
  BriefcaseBusiness,
  CalendarDays,
  MessageSquareReply,
  Trophy,
} from "lucide-react";
import { countChange, formatPercent, rateChange } from "@/lib/overview";
import type { OverviewAnalytics } from "@/server/services/analytics";
import { MetricCard, MetricCardSkeleton } from "./metric-card";

const grid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";

const recentNote = ({ recent }: CountMetric) =>
  recent === 0 ? "None in the last 30 days" : `${recent} in the last 30 days`;

/**
 * All-time totals (saved jobs aren't counted as sent), each with what
 * happened in the last 30 days. The funnel below follows a cohort instead.
 */
export async function OverviewMetrics({
  analytics,
}: {
  analytics: Promise<OverviewAnalytics>;
}) {
  const { applications, interviews, responseRate, offers } = (await analytics)
    .metrics;

  return (
    <section aria-label="Summary" className={grid}>
      <MetricCard
        icon={<BriefcaseBusiness aria-hidden="true" />}
        label="Applications sent"
        value={String(applications.total)}
        change={countChange(applications)}
        note={recentNote(applications)}
        trend={applications.trend}
        trendLabel="Applications sent per week over the last 12 weeks"
      />
      <MetricCard
        icon={<CalendarDays aria-hidden="true" />}
        label="Reached interview"
        value={String(interviews.total)}
        change={countChange(interviews)}
        note={recentNote(interviews)}
        trend={interviews.trend}
        trendLabel="Applications reaching interviews per week over the last 12 weeks"
      />
      <MetricCard
        icon={<MessageSquareReply aria-hidden="true" />}
        label="Response rate"
        value={formatPercent(responseRate.value)}
        change={rateChange(responseRate)}
        note="of applications sent, vs. 30 days ago"
        trend={responseRate.trend}
        trendLabel="Response rate at the end of each of the last 12 weeks"
      />
      <MetricCard
        icon={<Trophy aria-hidden="true" />}
        label="Offers"
        value={String(offers.total)}
        change={countChange(offers)}
        note={recentNote(offers)}
        trend={offers.trend}
        trendLabel="Offers per week over the last 12 weeks"
      />
    </section>
  );
}

export function OverviewMetricsSkeleton() {
  return (
    <div
      className={grid}
      role="status"
      aria-busy="true"
      aria-label="Loading summary"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <MetricCardSkeleton key={index} />
      ))}
    </div>
  );
}
