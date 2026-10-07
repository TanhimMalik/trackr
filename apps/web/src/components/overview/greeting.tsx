"use client";

import { useMounted } from "@/hooks/use-mounted";
import { greetingFor } from "@/lib/overview";
import { cn } from "@/lib/utils";

/**
 * "Good evening, Tanhim" and today's date in the viewer's time zone. The
 * server doesn't know that time zone, so the text stays hidden until it is
 * mounted rather than flashing the wrong part of the day.
 */
export function Greeting({ name }: { name: string | null }) {
  const mounted = useMounted();
  const now = new Date();
  const firstName = name?.trim().split(/\s+/)[0];
  // Server and hydration render in UTC so they agree; then local time.
  const greeting = greetingFor(mounted ? now.getHours() : now.getUTCHours());
  const date = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: mounted ? undefined : "UTC",
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-1 transition-opacity duration-150 motion-reduce:transition-none sm:flex-row sm:items-end sm:justify-between",
        mounted ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1
          className="text-[1.375rem] leading-7 font-semibold tracking-tight"
          suppressHydrationWarning
        >
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening with your job search.
        </p>
      </div>
      <p
        className="text-muted-foreground tabular-nums sm:pb-px"
        suppressHydrationWarning
      >
        {date}
      </p>
    </div>
  );
}
