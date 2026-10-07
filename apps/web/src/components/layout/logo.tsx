import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
    >
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <path
        d="M6.5 15.5 10 12l2.75 2.75L17.5 10"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Logo linking to the overview. With `collapsible`, the wordmark hides on the
 * medium-width icon rail and reappears with the full sidebar.
 */
export function Logo({
  collapsible = false,
  className,
}: {
  collapsible?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/overview"
      className={cn(
        "flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <LogoMark />
      <span
        className={cn(
          "text-base font-semibold tracking-tight",
          collapsible && "md:sr-only xl:not-sr-only",
        )}
      >
        Trackr
      </span>
    </Link>
  );
}
