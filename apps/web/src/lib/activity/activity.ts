import { z } from "zod";

export const ACTIVITY_SOURCES = ["all", "automatic", "manual"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  all: "All",
  automatic: "Automatic",
  manual: "Manual",
};

/** Where to continue an activity list: the last event shown. */
export type ActivityCursor = {
  eventTimestamp: Date;
  createdAt: Date;
  id: string;
};

export type ActivityFilters = {
  source: ActivitySource;
  before: ActivityCursor | null;
};

const SEPARATOR = "_";

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return [
    cursor.eventTimestamp.toISOString(),
    cursor.createdAt.toISOString(),
    cursor.id,
  ].join(SEPARATOR);
}

const cursorSchema = z.tuple([z.iso.datetime(), z.iso.datetime(), z.uuid()]);

/** Reads a cursor from the URL; anything malformed starts from the newest. */
export function decodeActivityCursor(
  value: string | undefined,
): ActivityCursor | null {
  if (!value) return null;
  const parsed = cursorSchema.safeParse(value.split(SEPARATOR));
  if (!parsed.success) return null;
  const [eventTimestamp, createdAt, id] = parsed.data;
  return {
    eventTimestamp: new Date(eventTimestamp),
    createdAt: new Date(createdAt),
    id,
  };
}

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function parseActivityFilters(
  params: Record<string, string | string[] | undefined>,
): ActivityFilters {
  const source = first(params.source);
  return {
    source: (ACTIVITY_SOURCES as readonly string[]).includes(source ?? "")
      ? (source as ActivitySource)
      : "all",
    before: decodeActivityCursor(first(params.before)),
  };
}

/** The URL for a filtered, paginated activity list. Defaults stay out of it. */
export function activityHref({
  source,
  before,
}: {
  source: ActivitySource;
  before?: ActivityCursor | null;
}): string {
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (before) params.set("before", encodeActivityCursor(before));
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}

const dayKeyFormat = (timeZone: string | undefined) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });

/** "2026-10-07": the calendar day a moment falls on in a time zone. */
export function dayKey(date: Date, timeZone?: string): string {
  return dayKeyFormat(timeZone).format(date);
}

/**
 * Splits items, already newest first, into runs that share a calendar day,
 * labelled "Today", "Yesterday", "Monday, October 5" or, in another year,
 * "Monday, October 6, 2025".
 */
export function groupByDay<T>(
  items: T[],
  dateOf: (item: T) => Date,
  { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {},
): { key: string; label: string; items: T[] }[] {
  const today = dayKey(now, timeZone);
  const yesterday = dayKey(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    timeZone,
  );
  const currentYear = today.slice(0, 4);

  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const date = dateOf(item);
    const key = dayKey(date, timeZone);
    const last = groups.at(-1);
    if (last?.key === key) {
      last.items.push(item);
      continue;
    }
    const label =
      key === today
        ? "Today"
        : key === yesterday
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              ...(key.startsWith(currentYear) ? {} : { year: "numeric" }),
              timeZone,
            }).format(date);
    groups.push({ key, label, items: [item] });
  }
  return groups;
}
