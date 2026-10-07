import { BriefcaseBusiness } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Here's what's happening with your job search."
      />
      <EmptyState
        icon={BriefcaseBusiness}
        title="No applications yet"
        description="Applications you add, and the ones Trackr detects from your browser and inbox, will appear here."
      />
    </div>
  );
}
