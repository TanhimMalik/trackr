"use client";

import {
  APPLICATION_SOURCE_LABELS,
  APPLICATION_SOURCES,
  APPLICATION_STATUS_LABELS,
} from "@trackr/domain";
import { ArrowUpDown, ChevronDown, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  APPLIED_WITHIN_OPTIONS,
  EMPTY_FILTERS,
  filtersToSearchParams,
  hasActiveFilters,
  RESPONSE_OPTIONS,
  SORT_OPTIONS,
  type ApplicationFilters,
  type ApplicationSort,
  type AppliedWithin,
  type ResponseFilter,
} from "@/lib/applications/filters";
import { SELECTABLE_STATUSES } from "@/lib/applications/input";
import { cn } from "@/lib/utils";
import { StatusDot } from "./status-badge";

const ANY = "any";

function toggle<T>(values: T[], value: T, checked: boolean): T[] {
  return checked ? [...values, value] : values.filter((item) => item !== value);
}

/** A menu trigger; extra props come from the menu (handlers, ARIA, ref). */
function FilterButton({
  label,
  count,
  value,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string;
  count?: number;
  value?: string;
}) {
  const active = Boolean(count || value);
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        active && "border-primary/40 bg-primary-soft text-primary-text",
        className,
      )}
      {...props}
    >
      {label}
      {value && <span className="font-normal">· {value}</span>}
      {count ? (
        <span className="rounded-sm bg-primary px-1 text-[0.7rem] leading-4 font-semibold text-primary-foreground tabular-nums">
          {count}
        </span>
      ) : null}
      <ChevronDown className="text-muted-foreground" />
    </Button>
  );
}

/**
 * Search, filters and sorting for the applications list. The URL holds the
 * state, so every view can be linked to and survives a refresh.
 */
export function ApplicationsToolbar({
  filters,
  resultCount,
  totalCount,
  children,
}: {
  filters: ApplicationFilters;
  resultCount: number;
  totalCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Keep the search box in step when the URL changes (back/forward, clear).
  const [query, setQuery] = useState(filters.query);
  const [syncedQuery, setSyncedQuery] = useState(filters.query);
  if (filters.query !== syncedQuery) {
    setSyncedQuery(filters.query);
    setQuery(filters.query);
  }

  function apply(next: Partial<ApplicationFilters>) {
    const params = filtersToSearchParams({ ...filters, query, ...next });
    // Filters change, the chosen view stays.
    const view = searchParams.get("view");
    if (view) params.set("view", view);
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    });
  }

  // Search as the person types, without a request per keystroke.
  useEffect(() => {
    if (query.trim() === filters.query) return;
    const timer = setTimeout(() => apply({ query: query.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the latest filters
  }, [query]);

  const sortLabel = SORT_OPTIONS[filters.sort];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, role or location"
            aria-label="Search applications"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <FilterButton label="Status" count={filters.statuses.length} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {SELECTABLE_STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={filters.statuses.includes(status)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    apply({
                      statuses: toggle(filters.statuses, status, checked),
                    })
                  }
                >
                  <StatusDot status={status} />
                  {APPLICATION_STATUS_LABELS[status]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <FilterButton
                label="Found through"
                count={filters.sources.length}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {APPLICATION_SOURCES.map((source) => (
                <DropdownMenuCheckboxItem
                  key={source}
                  checked={filters.sources.includes(source)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    apply({ sources: toggle(filters.sources, source, checked) })
                  }
                >
                  {APPLICATION_SOURCE_LABELS[source]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <FilterButton
                label="Applied"
                value={
                  filters.appliedWithin
                    ? APPLIED_WITHIN_OPTIONS[filters.appliedWithin]
                    : undefined
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuRadioGroup
                value={filters.appliedWithin ?? ANY}
                onValueChange={(value) =>
                  apply({
                    appliedWithin:
                      value === ANY ? null : (value as AppliedWithin),
                  })
                }
              >
                <DropdownMenuRadioItem value={ANY}>
                  Any time
                </DropdownMenuRadioItem>
                {Object.entries(APPLIED_WITHIN_OPTIONS).map(
                  ([value, label]) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {label}
                    </DropdownMenuRadioItem>
                  ),
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <FilterButton
                label="Response"
                value={
                  filters.response
                    ? RESPONSE_OPTIONS[filters.response]
                    : undefined
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuRadioGroup
                value={filters.response ?? ANY}
                onValueChange={(value) =>
                  apply({
                    response: value === ANY ? null : (value as ResponseFilter),
                  })
                }
              >
                <DropdownMenuRadioItem value={ANY}>All</DropdownMenuRadioItem>
                {Object.entries(RESPONSE_OPTIONS).map(([value, label]) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {hasActiveFilters(filters) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                apply({ ...EMPTY_FILTERS, sort: filters.sort });
              }}
            >
              <X />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 lg:ml-auto">
          <p className="text-muted-foreground tabular-nums" aria-live="polite">
            {resultCount === totalCount
              ? `${totalCount} applications`
              : `${resultCount} of ${totalCount}`}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Sort: ${sortLabel}`}
              >
                <ArrowUpDown />
                {sortLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuRadioGroup
                value={filters.sort}
                onValueChange={(value) =>
                  apply({ sort: value as ApplicationSort })
                }
              >
                {Object.entries(SORT_OPTIONS).map(([value, label]) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        aria-busy={pending}
        className={cn("transition-opacity", pending && "opacity-60")}
      >
        {children}
      </div>
    </div>
  );
}
