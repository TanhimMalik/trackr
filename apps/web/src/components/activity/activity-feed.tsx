"use client";

import { APPLICATION_STATUS_LABELS } from "@trackr/domain";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  chip,
  SourceIcon,
} from "@/components/applications/application-timeline";
import { CompanyAvatar } from "@/components/applications/company-avatar";
import { StatusDot } from "@/components/applications/status-badge";
import { TimelineEventAction } from "@/components/applications/timeline-event-action";
import { useMounted } from "@/hooks/use-mounted";
import { groupByDay } from "@/lib/activity/activity";
import { describeEvent, eventActionFor } from "@/lib/applications/timeline";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/services/activity";

const timeFormat = (timeZone: string | undefined) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

/**
 * Activity grouped by day. Days and times are in UTC while rendering on the
 * server and switch to the viewer's time zone once mounted.
 */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const mounted = useMounted();
  const timeZone = mounted ? undefined : "UTC";
  const groups = groupByDay(items, (item) => item.eventTimestamp, {
    timeZone,
  });
  const time = timeFormat(timeZone);

  return (
    <div className="flex flex-col gap-6" suppressHydrationWarning>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.label}
          </h2>
          <ol className="divide-y rounded-xl border bg-card">
            {group.items.map((item) => (
              <ActivityRow
                key={item.id}
                item={item}
                time={time.format(item.eventTimestamp)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ActivityRow({ item, time }: { item: ActivityItem; time: string }) {
  const entry = describeEvent(item);
  const action = eventActionFor(item, item.application.activeEvents);
  const automatic = entry.source.automatic;

  return (
    <li className="group/event relative flex items-start gap-3 px-4 py-3 has-[a:hover]:bg-muted/40">
      <CompanyAvatar
        name={item.application.companyName}
        domain={item.application.companyDomain}
        className="mt-0.5"
      />
      <div className={cn("min-w-0 flex-1", entry.reverted && "opacity-60")}>
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/applications/${item.application.id}`}
            className="min-w-0 truncate outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            <span className="font-medium">{item.application.companyName}</span>
            <span className="text-muted-foreground"> · </span>
            <span className={cn(entry.reverted && "line-through")}>
              {entry.title}
            </span>
            {entry.detail && (
              <span className="text-muted-foreground"> · {entry.detail}</span>
            )}
          </Link>
          <time
            dateTime={item.eventTimestamp.toISOString()}
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
            suppressHydrationWarning
          >
            {time}
          </time>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={chip}>
            <SourceIcon source={item.sourceType} />
            {entry.source.label}
            {entry.source.confidence !== null &&
              ` · ${entry.source.confidence}%`}
          </span>
          {entry.transition && (
            <span className={chip}>
              <StatusDot status={entry.transition.from} />
              {APPLICATION_STATUS_LABELS[entry.transition.from]}
              <ArrowRight className="size-3" aria-label="to" />
              <StatusDot status={entry.transition.to} />
              {APPLICATION_STATUS_LABELS[entry.transition.to]}
            </span>
          )}
          {entry.reverted && <span className={chip}>Undone</span>}
          {action && (
            <div
              className={cn(
                // Above the row's link, so it stays clickable.
                "relative z-10 ml-auto",
                action === "undo" &&
                  "pointer-fine:opacity-0 pointer-fine:group-focus-within/event:opacity-100 pointer-fine:group-hover/event:opacity-100",
              )}
            >
              <TimelineEventAction
                eventId={item.id}
                action={action}
                label={`${item.application.companyName} ${entry.title}`}
              />
            </div>
          )}
        </div>
      </div>
      <span
        aria-hidden="true"
        title={automatic ? "Recorded automatically" : "Manual change"}
        className={cn(
          "mt-2 size-2 shrink-0 rounded-full",
          automatic ? "bg-success" : "bg-status-neutral",
        )}
      />
      <span className="sr-only">
        {automatic ? "Recorded automatically" : "Manual change"}
      </span>
    </li>
  );
}
