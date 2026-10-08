import { CircleCheck, History, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { ActivitySourceFilter } from "@/components/activity/activity-source-filter";
import { ActivityTabs } from "@/components/activity/activity-tabs";
import { ReviewQueue } from "@/components/activity/review-queue";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  activityHref,
  parseActivityFilters,
  type ActivityFilters,
} from "@/lib/activity/activity";
import { requireUser } from "@/server/auth/session";
import { listActivity } from "@/server/services/activity";
import {
  countOpenReviewItems,
  listOpenReviewItems,
} from "@/server/services/review";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({
  searchParams,
}: PageProps<"/activity">) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = params.tab === "review" ? "review" : "all";
  const reviewCount = await countOpenReviewItems(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Everything that happened across your applications, newest first."
      />
      <ActivityTabs tab={tab} reviewCount={reviewCount} />
      {tab === "review" ? (
        <NeedsReview userId={user.id} />
      ) : (
        <AllActivity userId={user.id} filters={parseActivityFilters(params)} />
      )}
    </div>
  );
}

async function NeedsReview({ userId }: { userId: string }) {
  const items = await listOpenReviewItems(userId);
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Nothing to review"
        description="When Trackr isn't sure about something, such as a possible duplicate, it asks you here."
      />
    );
  }
  return <ReviewQueue items={items} />;
}

async function AllActivity({
  userId,
  filters: { source, before },
}: {
  userId: string;
  filters: ActivityFilters;
}) {
  const { items, next } = await listActivity(userId, { source, before });

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <ActivitySourceFilter source={source} />
        {before && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={activityHref({ source })}>Back to newest</Link>
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        before || source !== "all" ? (
          <EmptyState
            icon={SearchX}
            title="Nothing here"
            description={
              before
                ? "There's no older activity."
                : `No ${source} activity yet.`
            }
            action={
              <Button variant="outline" asChild>
                <Link href={activityHref({ source: "all" })}>
                  Show all activity
                </Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Applications you add, and updates Trackr detects from the browser extension and Gmail, will show up here."
          />
        )
      ) : (
        <>
          <ActivityFeed items={items} />
          {next && (
            <div className="flex justify-center">
              <Button variant="outline" asChild>
                <Link href={activityHref({ source, before: next })}>
                  Older activity
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
