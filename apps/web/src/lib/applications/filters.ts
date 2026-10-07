import {
  APPLICATION_SOURCES,
  type ApplicationSource,
  type ApplicationStatus,
} from "@trackr/domain";
import { SELECTABLE_STATUSES } from "./input";

export const SORT_OPTIONS = {
  updated: "Recently updated",
  newest: "Newest applied",
  oldest: "Oldest applied",
  company: "Company A–Z",
  status: "Status",
} as const;
export type ApplicationSort = keyof typeof SORT_OPTIONS;
export const DEFAULT_SORT: ApplicationSort = "updated";

export const APPLIED_WITHIN_OPTIONS = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
} as const;
export type AppliedWithin = keyof typeof APPLIED_WITHIN_OPTIONS;

export const RESPONSE_OPTIONS = {
  responded: "Responded",
  waiting: "No response yet",
} as const;
export type ResponseFilter = keyof typeof RESPONSE_OPTIONS;

export type ApplicationFilters = {
  /** Matches company, role or location. */
  query: string;
  statuses: ApplicationStatus[];
  sources: ApplicationSource[];
  appliedWithin: AppliedWithin | null;
  response: ResponseFilter | null;
  sort: ApplicationSort;
};

export const EMPTY_FILTERS: ApplicationFilters = {
  query: "",
  statuses: [],
  sources: [],
  appliedWithin: null,
  response: null,
  sort: DEFAULT_SORT,
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const isOneOf = <T extends string>(
  options: readonly T[],
  value: string | undefined,
): value is T => value !== undefined && options.includes(value as T);

/** Values from a comma-separated parameter, keeping only allowed ones, once each. */
function listParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  const raw = first(value);
  if (!raw) return [];
  const values = raw.split(",").filter((item) => isOneOf(allowed, item));
  return [...new Set(values)] as T[];
}

/**
 * Reads filters from the page's search parameters. Unknown or malformed
 * values are ignored, so a hand-edited or stale link still works.
 */
export function parseApplicationFilters(
  params: SearchParams,
): ApplicationFilters {
  const sort = first(params.sort);
  const appliedWithin = first(params.applied);
  const response = first(params.response);

  return {
    query: (first(params.q) ?? "").trim().slice(0, 100),
    statuses: listParam(params.status, SELECTABLE_STATUSES),
    sources: listParam(params.source, APPLICATION_SOURCES),
    appliedWithin: isOneOf(
      Object.keys(APPLIED_WITHIN_OPTIONS) as AppliedWithin[],
      appliedWithin,
    )
      ? appliedWithin
      : null,
    response: isOneOf(
      Object.keys(RESPONSE_OPTIONS) as ResponseFilter[],
      response,
    )
      ? response
      : null,
    sort: isOneOf(Object.keys(SORT_OPTIONS) as ApplicationSort[], sort)
      ? sort
      : DEFAULT_SORT,
  };
}

/** The search parameters for a set of filters, omitting defaults. */
export function filtersToSearchParams(
  filters: ApplicationFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.statuses.length) params.set("status", filters.statuses.join(","));
  if (filters.sources.length) params.set("source", filters.sources.join(","));
  if (filters.appliedWithin) params.set("applied", filters.appliedWithin);
  if (filters.response) params.set("response", filters.response);
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  return params;
}

/** True when anything narrows the list (sorting does not). */
export function hasActiveFilters(filters: ApplicationFilters): boolean {
  return Boolean(
    filters.query ||
    filters.statuses.length ||
    filters.sources.length ||
    filters.appliedWithin ||
    filters.response,
  );
}
