import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function ApplicationNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Application not found"
      description="It may have been deleted, or the link is wrong."
      action={
        <Button variant="outline" asChild>
          <Link href="/applications">Back to applications</Link>
        </Button>
      }
    />
  );
}
