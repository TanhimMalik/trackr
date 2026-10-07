import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { sparklinePath, type Change } from "@/lib/overview";
import { cn } from "@/lib/utils";

const SPARKLINE = { width: 64, height: 24, inset: 1.5 };

function Sparkline({
  values,
  label,
}: {
  values: readonly (number | null)[];
  label: string;
}) {
  const path = sparklinePath(values, SPARKLINE);
  return (
    <svg
      viewBox={`0 0 ${SPARKLINE.width} ${SPARKLINE.height}`}
      width={SPARKLINE.width}
      height={SPARKLINE.height}
      role="img"
      aria-label={label}
      className="shrink-0 overflow-visible"
    >
      {path && (
        <path
          d={path}
          fill="none"
          className="stroke-primary/60"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function ChangeIndicator({ change }: { change: Change }) {
  return (
    <span
      title={change.description}
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        change.direction === "up" && "text-success",
        change.direction === "down" && "text-destructive",
        change.direction === "flat" && "text-muted-foreground",
      )}
    >
      {change.direction === "up" ? (
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      ) : change.direction === "down" ? (
        <ArrowDownRight className="size-3.5" aria-hidden="true" />
      ) : (
        <Minus className="size-3.5" aria-hidden="true" />
      )}
      <span aria-hidden="true">{change.label}</span>
      <span className="sr-only">{change.description}</span>
    </span>
  );
}

/** One summary metric: value, change against the previous period and a trend. */
export function MetricCard({
  icon,
  label,
  value,
  change,
  note,
  trend,
  trendLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: Change;
  /** What the change refers to, e.g. "12 in the last 30 days". */
  note: string;
  trend: readonly (number | null)[];
  trendLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
        <h3 className="text-[0.8125rem] text-muted-foreground">{label}</h3>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-[1.625rem] leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        <Sparkline values={trend} label={trendLabel} />
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <ChangeIndicator change={change} />
        <span className="text-muted-foreground">{note}</span>
      </p>
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="flex items-end justify-between">
        <Skeleton className="h-[1.625rem] w-14" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="h-3.5 w-36" />
    </div>
  );
}
