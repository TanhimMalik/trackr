import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while an application's details load. */
export function ApplicationDetailSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex items-start gap-3">
        <Skeleton className="size-11" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-16" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
