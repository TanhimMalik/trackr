import { cn } from "@/lib/utils";

const Bone = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-md bg-muted", className)} />
);

/** Placeholder while an application's details load. */
export function ApplicationDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-start gap-3">
        <Bone className="size-11" />
        <div className="flex-1 space-y-2">
          <Bone className="h-5 w-40" />
          <Bone className="h-4 w-56" />
        </div>
      </div>
      <div className="flex gap-2">
        <Bone className="h-7 w-28" />
        <Bone className="h-7 w-16" />
      </div>
      <Bone className="h-72 w-full rounded-xl" />
      <div className="space-y-3">
        <Bone className="h-4 w-20" />
        <Bone className="h-10 w-full" />
        <Bone className="h-10 w-full" />
      </div>
    </div>
  );
}
