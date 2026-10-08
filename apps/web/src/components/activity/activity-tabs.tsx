import Link from "next/link";
import { cn } from "@/lib/utils";

export type ActivityTab = "all" | "review";

/** All activity, or the decisions waiting for the person. */
export function ActivityTabs({
  tab,
  reviewCount,
}: {
  tab: ActivityTab;
  reviewCount: number;
}) {
  const tabs = [
    { id: "all", label: "All activity", href: "/activity" },
    { id: "review", label: "Needs review", href: "/activity?tab=review" },
  ] as const;

  return (
    <nav aria-label="Activity" className="flex gap-1 border-b">
      {tabs.map(({ id, label, href }) => (
        <Link
          key={id}
          href={href}
          aria-current={tab === id ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            tab === id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
          {id === "review" && reviewCount > 0 && (
            <span className="rounded-full bg-primary-soft px-1.5 text-xs text-primary-text tabular-nums">
              {reviewCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
