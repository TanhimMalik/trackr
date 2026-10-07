"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Shown inside the app shell when a page fails to load. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page_failed", { digest: error.digest });
  }, [error.digest]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h1 className="font-semibold">Something went wrong</h1>
        <p className="mx-auto max-w-sm text-muted-foreground">
          This page couldn&apos;t load. Try again, and if it keeps happening,
          come back in a few minutes.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">
            Reference: <code>{error.digest}</code>
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/overview">Go to Overview</Link>
        </Button>
      </div>
    </div>
  );
}
