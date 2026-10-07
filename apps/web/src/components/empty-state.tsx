import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="mx-auto max-w-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
