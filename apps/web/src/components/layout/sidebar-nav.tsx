"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isNavItemActive, navigation } from "./navigation";

/**
 * Primary navigation. With `collapsible`, labels collapse to icons with
 * tooltips on medium screens (the icon rail) and expand on extra-large screens.
 */
export function SidebarNav({
  collapsible = false,
  onNavigate,
}: {
  collapsible?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = isNavItemActive(pathname, href);
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              active &&
                "bg-primary-soft text-primary-text hover:bg-primary-soft hover:text-primary-text",
              collapsible &&
                "md:justify-center md:px-0 xl:justify-start xl:px-2.5",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className={cn(collapsible && "md:sr-only xl:not-sr-only")}>
              {label}
            </span>
          </Link>
        );

        if (!collapsible) {
          return <div key={href}>{link}</div>;
        }

        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="xl:hidden">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
