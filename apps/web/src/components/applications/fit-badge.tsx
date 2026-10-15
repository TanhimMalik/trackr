import { FIT_LABEL_NAMES, fitLabelFor, type FitLabel } from "@trackr/domain";
import { cn } from "@/lib/utils";

// Static class names so Tailwind can see them.
const TONE: Record<FitLabel, string> = {
  STRONG: "border-success/40 bg-success/10 text-success",
  POSSIBLE: "border-primary/30 bg-primary-soft text-primary-text",
  STRETCH: "bg-muted text-muted-foreground",
};

/** A fit score with its label. The words, not the color, carry the meaning. */
export function FitBadge({
  score,
  compact = false,
  stale = false,
  className,
}: {
  score: number;
  /** Just the number, for board cards. */
  compact?: boolean;
  /** Scored against an older resume profile. */
  stale?: boolean;
  className?: string;
}) {
  const label = fitLabelFor(score);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums",
        TONE[label],
        stale && "opacity-70",
        className,
      )}
      title={stale ? "Scored against your previous resume" : undefined}
    >
      {compact ? (
        <>
          <span className="sr-only">{FIT_LABEL_NAMES[label]}, </span>
          Fit {score}
        </>
      ) : (
        `${FIT_LABEL_NAMES[label]} · ${score}`
      )}
    </span>
  );
}
