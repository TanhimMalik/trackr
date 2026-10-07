"use client";

import { FlaskConical } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exitDemo, resetDemo } from "@/server/auth/demo";

/**
 * Tells a demo visitor what they're looking at, and lets them start over or
 * leave. Shown above every page of a demo workspace.
 */
export function DemoBanner({ lifetimeHours }: { lifetimeHours: number }) {
  const [resetting, startReset] = useTransition();
  const [exiting, startExit] = useTransition();

  function reset() {
    startReset(async () => {
      const { ok } = await resetDemo();
      if (ok) toast.success("Sample data restored.");
      else toast.error("Couldn't restore the sample data. Try again.");
    });
  }

  return (
    <div
      role="region"
      aria-label="Demo workspace"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-muted/60 px-4 py-2 text-[0.8125rem] md:px-6"
    >
      <FlaskConical
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">Demo workspace.</span>{" "}
        Sample data, private to you. Change anything; it&apos;s deleted after{" "}
        {lifetimeHours} hours.
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={resetting || exiting}
          onClick={reset}
        >
          {resetting ? "Restoring…" : "Reset data"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={resetting || exiting}
          onClick={() => startExit(() => exitDemo())}
        >
          {exiting ? "Ending…" : "End demo"}
        </Button>
      </div>
    </div>
  );
}
