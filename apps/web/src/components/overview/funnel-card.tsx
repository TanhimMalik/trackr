"use client";

import { FUNNEL_PERIODS, type Funnel, type FunnelPeriod } from "@trackr/domain";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPercent } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";

// Static class names so Tailwind can see them.
const BAR_OPACITY = ["opacity-100", "opacity-75", "opacity-55", "opacity-35"];

const periods = Object.entries(FUNNEL_PERIODS) as [
  FunnelPeriod,
  (typeof FUNNEL_PERIODS)[FunnelPeriod],
][];

/**
 * Applications sent in the chosen period, and how many of them got a
 * response, an interview and an offer.
 */
export function FunnelCard({
  funnels,
}: {
  funnels: Record<FunnelPeriod, Funnel>;
}) {
  const [period, setPeriod] = useState<FunnelPeriod>("all");
  const funnel = funnels[period];
  const stages = [
    { label: "Applied", value: funnel.applications },
    { label: "Responses", value: funnel.responses },
    { label: "Interviews", value: funnel.interviews },
    { label: "Offers", value: funnel.offers },
  ];
  const max = Math.max(funnel.applications, 1);

  return (
    <SectionCard
      id="application-funnel"
      title="Application funnel"
      action={
        <Select
          value={period}
          onValueChange={(value) => setPeriod(value as FunnelPeriod)}
        >
          <SelectTrigger size="sm" aria-label="Period" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {periods.map(([id, { label }]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {funnel.applications === 0 ? (
        <p className="flex flex-1 items-center justify-center py-6 text-center text-muted-foreground">
          No applications sent in the{" "}
          {FUNNEL_PERIODS[period].label.toLowerCase()}.
        </p>
      ) : (
        <ol className="grid flex-1 grid-cols-4 gap-3 pt-1">
          {stages.map((stage, index) => {
            const share = stage.value / max;
            return (
              <li key={stage.label} className="flex flex-col items-center">
                <span className="sr-only">
                  {`${stage.label}: ${stage.value}, ${formatPercent(share)} of applications`}
                </span>
                <span aria-hidden="true" className="font-semibold tabular-nums">
                  {stage.value}
                </span>
                <div className="mt-1.5 flex h-28 w-full items-end justify-center">
                  <div
                    aria-hidden="true"
                    className={cn(
                      "w-full max-w-14 rounded-md bg-primary",
                      BAR_OPACITY[index],
                    )}
                    // A sliver stays visible at zero so the column reads as empty.
                    style={{ height: `max(${share * 100}%, 2px)` }}
                  />
                </div>
                <span aria-hidden="true" className="mt-2 text-xs font-medium">
                  {stage.label}
                </span>
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {formatPercent(share)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
