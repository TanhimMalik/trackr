import { FileText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddApplicationButton } from "@/components/applications/application-dialogs";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { ApplicationsToolbar } from "@/components/applications/applications-toolbar";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseApplicationFilters } from "@/lib/applications/filters";
import { requireUser } from "@/server/auth/session";
import {
  countApplications,
  listApplications,
} from "@/server/services/applications";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({
  searchParams,
}: PageProps<"/applications">) {
  const user = await requireUser();
  const filters = parseApplicationFilters(await searchParams);
  const [applications, totalCount] = await Promise.all([
    listApplications(user.id, filters),
    countApplications(user.id),
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Every job you've saved or applied to."
        actions={<AddApplicationButton />}
      />
      <ApplicationsToolbar
        filters={filters}
        resultCount={applications.length}
        totalCount={totalCount}
      >
        {applications.length > 0 ? (
          <ApplicationsTable applications={applications} />
        ) : (
          <EmptyState
            icon={SearchX}
            title="No matching applications"
            description="Try a different search, or clear the filters to see everything."
            action={
              <Button variant="outline" asChild>
                <Link href="/applications">Clear filters</Link>
              </Button>
            }
          />
        )}
      </ApplicationsToolbar>
    </div>
  );
}
