import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A titled panel on the Overview. */
export function SectionCard({
  id,
  title,
  action,
  children,
  className,
}: {
  /** Used to label the section by its heading. */
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card",
        className,
      )}
    >
      <header className="flex min-h-12 items-center justify-between gap-3 px-4 pt-3 pb-2">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {action}
      </header>
      <div className="flex flex-1 flex-col px-4 pb-4">{children}</div>
    </section>
  );
}

export function SectionCardSkeleton({
  id,
  title,
  rows = 4,
}: {
  id: string;
  title: string;
  rows?: number;
}) {
  return (
    <SectionCard id={id} title={title}>
      <div className="flex flex-col gap-3 py-1" role="status" aria-busy="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-7 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
