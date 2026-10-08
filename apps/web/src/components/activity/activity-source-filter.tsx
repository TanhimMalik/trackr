"use client";

import { useRouter } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ACTIVITY_SOURCE_LABELS,
  ACTIVITY_SOURCES,
  activityHref,
  type ActivitySource,
} from "@/lib/activity/activity";

/** All, automatic or manual activity. Changing it starts from the newest again. */
export function ActivitySourceFilter({ source }: { source: ActivitySource }) {
  const router = useRouter();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={source}
      onValueChange={(next) => {
        if (next && next !== source) {
          router.replace(activityHref({ source: next as ActivitySource }));
        }
      }}
      aria-label="Show"
    >
      {ACTIVITY_SOURCES.map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="data-[state=on]:bg-primary-soft data-[state=on]:text-primary-text"
        >
          {ACTIVITY_SOURCE_LABELS[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
