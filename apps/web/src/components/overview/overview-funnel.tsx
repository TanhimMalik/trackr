import { Skeleton } from "@/components/ui/skeleton";
import type { OverviewAnalytics } from "@/server/services/analytics";
import { FunnelCard } from "./funnel-card";
import { SectionCard } from "./section-card";

export async function OverviewFunnel({
  analytics,
}: {
  analytics: Promise<OverviewAnalytics>;
}) {
  const { funnels } = await analytics;
  return <FunnelCard funnels={funnels} />;
}

export function OverviewFunnelSkeleton() {
  return (
    <SectionCard id="application-funnel" title="Application funnel">
      <div
        className="grid grid-cols-4 gap-3 pt-1"
        role="status"
        aria-busy="true"
      >
        {[100, 60, 35, 12].map((height) => (
          <div key={height} className="flex flex-col items-center gap-2">
            <Skeleton className="h-4 w-6" />
            <div className="flex h-28 w-full items-end justify-center">
              <Skeleton
                className="w-full max-w-14"
                style={{ height: `${height}%` }}
              />
            </div>
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
