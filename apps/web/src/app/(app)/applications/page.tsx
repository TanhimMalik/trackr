import { BOARD_COLUMNS } from "@trackr/domain";
import { FileText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { BoardItem } from "@/components/applications/application-card";
import { AddApplicationButton } from "@/components/applications/application-dialogs";
import { ApplicationsBoard } from "@/components/applications/applications-board";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { ApplicationsToolbar } from "@/components/applications/applications-toolbar";
import { formDefaultsFor } from "@/components/applications/form-defaults";
import {
  ViewToggle,
  type ApplicationsView,
} from "@/components/applications/view-toggle";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseApplicationFilters } from "@/lib/applications/filters";
import { requireUser } from "@/server/auth/session";
import {
  countApplications,
  listApplications,
  listBoardApplications,
  type BoardApplication,
} from "@/server/services/applications";

export const metadata: Metadata = { title: "Applications" };

const ALL_COLUMNS = BOARD_COLUMNS.map((column) => column.id);

function toBoardItem(application: BoardApplication): BoardItem {
  return {
    id: application.id,
    companyName: application.companyName,
    companyDomain: application.companyDomain,
    jobTitle: application.jobTitle,
    status: application.currentStatus,
    appliedAt: application.appliedAt,
    createdAt: application.createdAt,
    signal: application.signal,
    defaults: formDefaultsFor(application),
  };
}

export default async function ApplicationsPage({
  searchParams,
}: PageProps<"/applications">) {
  const user = await requireUser();
  const params = await searchParams;
  const view: ApplicationsView = params.view === "table" ? "table" : "board";
  const filters = parseApplicationFilters(params);

  const [totalCount, applications] = await Promise.all([
    countApplications(user.id),
    view === "board"
      ? listBoardApplications(user.id, filters)
      : listApplications(user.id, filters),
  ]);

  if (totalCount === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Applications"
          description="Every job you've saved or applied to."
        />
        <EmptyState
          icon={FileText}
          title="No applications yet"
          description="Add an application by hand. Once the browser extension and Gmail are connected, applications will appear here on their own."
          action={<AddApplicationButton />}
        />
      </div>
    );
  }

  const noMatches = (
    <EmptyState
      icon={SearchX}
      title="No matching applications"
      description="Try a different search, or clear the filters to see everything."
      action={
        <Button variant="outline" asChild>
          <Link
            href={
              view === "table" ? "/applications?view=table" : "/applications"
            }
          >
            Clear filters
          </Link>
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Every job you've saved or applied to."
        actions={
          <>
            <ViewToggle view={view} />
            <AddApplicationButton />
          </>
        }
      />
      <ApplicationsToolbar
        filters={filters}
        resultCount={applications.length}
        totalCount={totalCount}
      >
        {applications.length === 0 ? (
          noMatches
        ) : view === "board" ? (
          <ApplicationsBoard
            items={(applications as BoardApplication[]).map(toBoardItem)}
            columnIds={ALL_COLUMNS}
          />
        ) : (
          <ApplicationsTable applications={applications} />
        )}
      </ApplicationsToolbar>
    </div>
  );
}
