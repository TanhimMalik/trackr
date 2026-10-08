"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import { CompanyAvatar } from "@/components/applications/company-avatar";
import { DateText } from "@/components/date-text";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/server/services/notifications";

/** The header's bell: what Trackr noticed lately, each linking to its application. */
export function NotificationCenter({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [, startLoading] = useTransition();
  const [markingAll, startMarkingAll] = useTransition();

  const unreadShown = items?.filter((item) => !item.readAt).length ?? 0;
  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    // Shows what was loaded last time right away and refreshes it.
    startLoading(async () => {
      setItems(await listNotificationsAction());
    });
  }

  function markLocally(predicate: (item: NotificationItem) => boolean) {
    const now = new Date();
    setItems(
      (current) =>
        current?.map((item) =>
          !item.readAt && predicate(item) ? { ...item, readAt: now } : item,
        ) ?? null,
    );
  }

  function openItem(item: NotificationItem) {
    setOpen(false);
    if (!item.readAt) {
      markLocally((other) => other.id === item.id);
      void markNotificationReadAction(item.id);
    }
    if (item.type === "REVIEW_NEEDED") router.push("/activity?tab=review");
    else if (item.applicationId) {
      router.push(`/applications/${item.applicationId}`);
    }
  }

  function markAllRead() {
    markLocally(() => true);
    startMarkingAll(() => markAllNotificationsReadAction());
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 left-5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background"
            >
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="w-[calc(100vw-2rem)] gap-0 p-0 sm:w-96"
      >
        <div className="flex items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
          <h2 className="font-semibold">Notifications</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            disabled={markingAll || unreadShown === 0}
          >
            <CheckCheck aria-hidden="true" />
            Mark all as read
          </Button>
        </div>
        <NotificationList items={items} onSelect={openItem} />
      </PopoverContent>
    </Popover>
  );
}

function NotificationList({
  items,
  onSelect,
}: {
  items: NotificationItem[] | null;
  onSelect: (item: NotificationItem) => void;
}) {
  if (!items) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="font-medium">You&apos;re all caught up</p>
        <p className="mt-1 text-muted-foreground">
          Changes Trackr picks up from your email appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="max-h-[min(28rem,70dvh)] divide-y overflow-y-auto">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
          >
            <CompanyAvatar
              name={item.companyName ?? item.title}
              domain={item.companyDomain}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block",
                  item.readAt ? "text-muted-foreground" : "font-medium",
                )}
              >
                {item.title}
              </span>
              <span className="flex gap-1 text-[0.8125rem] text-muted-foreground">
                {item.body && (
                  <>
                    <span className="truncate">{item.body}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <DateText
                  date={new Date(item.createdAt)}
                  relative
                  className="shrink-0"
                />
              </span>
            </span>
            {!item.readAt && (
              <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
                <span className="sr-only">Unread</span>
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
