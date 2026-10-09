import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shown while a page loads after a navigation: its real title right away,
 * then the shape of what's coming, so the click feels answered.
 */
export function PageSkeleton({
  title,
  layout,
}: {
  title: string;
  layout: "board" | "list" | "sections";
}) {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label={`Loading ${title.toLowerCase()}`}
    >
      <div className="space-y-2">
        <h1 className="text-[1.375rem] leading-7 font-semibold tracking-tight">
          {title}
        </h1>
        <Skeleton className="h-4 w-64" />
      </div>
      {layout === "board" && (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((column) => (
            <div
              key={column}
              className="flex h-96 w-[15.5rem] shrink-0 flex-col gap-2 rounded-xl bg-column p-2"
            >
              <Skeleton className="mx-1.5 my-0.5 h-4 w-24 bg-background" />
              {[0, 1, 2].map((card) => (
                <Skeleton
                  key={card}
                  className="h-24 rounded-lg bg-background"
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {layout !== "board" &&
        [0, 1, 2].map((block) => (
          <Skeleton
            key={block}
            className={cn(
              "w-full rounded-xl",
              layout === "list" ? "h-16" : "h-36",
            )}
          />
        ))}
    </div>
  );
}
