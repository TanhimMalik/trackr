import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Every job you've saved or applied to."
      />
      <EmptyState
        icon={FileText}
        title="No applications yet"
        description="Your applications will appear here as a board and a table."
      />
    </div>
  );
}
