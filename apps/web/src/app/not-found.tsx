import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    // Usually shown inside the app shell, so it doesn't fill the screen.
    <div className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <div className="space-y-1">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Compass className="size-5" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="max-w-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Go to Trackr</Link>
      </Button>
    </div>
  );
}
