import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { AddApplicationButton } from "@/components/applications/application-dialogs";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth/session";
import { listApplications } from "@/server/services/applications";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const applications = await listApplications(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Every job you've saved or applied to."
        actions={applications.length > 0 && <AddApplicationButton />}
      />
      {applications.length > 0 ? (
        <ApplicationsTable applications={applications} />
      ) : (
        <EmptyState
          icon={FileText}
          title="No applications yet"
          description="Add an application by hand. Once the browser extension and Gmail are connected, applications will appear here on their own."
          action={<AddApplicationButton />}
        />
      )}
    </div>
  );
}
