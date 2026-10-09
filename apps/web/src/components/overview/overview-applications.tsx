import { ACTIVE_BOARD_COLUMN_IDS, BOARD_COLUMNS } from "@trackr/domain";
import { CircleDashed } from "lucide-react";
import { ApplicationsBoard } from "@/components/applications/applications-board";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { toBoardItem } from "@/components/applications/board-items";
import type { ApplicationsView } from "@/components/applications/view-toggle";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listApplications,
  listBoardApplications,
} from "@/server/services/applications";

const ACTIVE_STATUSES = BOARD_COLUMNS.filter((column) =>
  (ACTIVE_BOARD_COLUMN_IDS as readonly string[]).includes(column.id),
).flatMap((column) => column.statuses);

/**
 * Applications still in play: applied, in assessment, interviewing or with an
 * offer. Saved and closed ones live on the Applications page.
 */
export async function OverviewApplications({
  userId,
  view,
}: {
  userId: string;
  view: ApplicationsView;
}) {
  const filters = { statuses: [...ACTIVE_STATUSES] };

  if (view === "table") {
    const applications = await listApplications(userId, filters);
    return applications.length === 0 ? (
      <NoActiveApplications />
    ) : (
      <ApplicationsTable applications={applications} />
    );
  }

  const applications = await listBoardApplications(userId, filters);
  return applications.length === 0 ? (
    <NoActiveApplications />
  ) : (
    <ApplicationsBoard
      items={applications.map(toBoardItem)}
      columnIds={ACTIVE_BOARD_COLUMN_IDS}
    />
  );
}

function NoActiveApplications() {
  return (
    <EmptyState
      icon={CircleDashed}
      title="Nothing in progress"
      description="Applications you're waiting to hear back on, interviewing for or have an offer from will show up here."
    />
  );
}

export function OverviewApplicationsSkeleton() {
  return (
    <div
      className="-mx-4 flex gap-3 overflow-hidden px-4 pb-2 md:-mx-6 md:px-6"
      aria-busy="true"
      aria-label="Loading applications"
    >
      {ACTIVE_BOARD_COLUMN_IDS.map((id) => (
        <div
          key={id}
          className="flex w-[17rem] shrink-0 flex-col gap-2 rounded-xl bg-column p-2"
        >
          <Skeleton className="mx-1.5 my-0.5 h-4 w-24 bg-background" />
          {[0, 1].map((card) => (
            <Skeleton key={card} className="h-24 rounded-lg bg-background" />
          ))}
        </div>
      ))}
    </div>
  );
}
