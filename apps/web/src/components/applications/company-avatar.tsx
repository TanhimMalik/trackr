import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A square company mark. Shows initials; logos are layered on in a later step. */
export function CompanyAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
