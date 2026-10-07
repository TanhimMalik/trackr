"use client";

import { useMounted } from "@/hooks/use-mounted";
import {
  formatDateTime,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/format";

/**
 * A date in the viewer's time zone. The server renders it in UTC; once mounted
 * in the browser it switches to local time.
 */
export function DateText({
  date,
  relative = false,
  className,
}: {
  date: Date;
  relative?: boolean;
  className?: string;
}) {
  const mounted = useMounted();
  const timeZone = mounted ? undefined : "UTC";
  const text = relative
    ? formatRelativeTime(date, { timeZone })
    : formatShortDate(date, { timeZone });

  return (
    <time
      dateTime={date.toISOString()}
      title={mounted ? date.toLocaleString() : undefined}
      className={className}
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}

/** A date and time in the viewer's time zone ("Thu, Oct 9 · 2:00 PM"). */
export function DateTimeText({
  date,
  className,
}: {
  date: Date;
  className?: string;
}) {
  const mounted = useMounted();
  return (
    <time
      dateTime={date.toISOString()}
      className={className}
      suppressHydrationWarning
    >
      {formatDateTime(date, { timeZone: mounted ? undefined : "UTC" })}
    </time>
  );
}
