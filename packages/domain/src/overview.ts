import {
  computeFunnel,
  percentagePointChange,
  percentChange,
  ratio,
  type ApplicationProgress,
  type Funnel,
} from "./analytics";

/**
 * The Overview's summary metrics. Headline values cover all time, so they
 * match the funnel's "All time" view. Momentum compares the last 30 days with
 * the 30 days before, and the trend lines show the last 12 weeks.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const OVERVIEW_PERIOD_DAYS = 30;
export const OVERVIEW_TREND_WEEKS = 12;

export type CountMetric = {
  /** All time. */
  total: number;
  /** In the last period. */
  recent: number;
  /** In the period before that. */
  previous: number;
  /** recent vs previous as a fraction (0.5 = +50%), or null without a baseline. */
  change: number | null;
  /** Per week, oldest first; the last week ends now. */
  trend: number[];
};

export type RateMetric = {
  /** All time, or null before the first application. */
  value: number | null;
  /** As of the start of the last period. */
  previous: number | null;
  /** In percentage points, or null when either side is unknown. */
  change: number | null;
  numerator: number;
  denominator: number;
  /** As of the end of each week, oldest first. */
  trend: (number | null)[];
};

export type OverviewMetrics = {
  applications: CountMetric;
  interviews: CountMetric;
  offers: CountMetric;
  responseRate: RateMetric;
};

type Applied = ApplicationProgress & { appliedAt: Date };

const isApplied = (progress: ApplicationProgress): progress is Applied =>
  progress.appliedAt !== null;

const daysBefore = (date: Date, days: number) =>
  new Date(date.getTime() - days * DAY_MS);

/** In (start, end], so adjacent windows never count a moment twice. */
const within = (date: Date | null, start: Date, end: Date) =>
  date !== null && date > start && date <= end;

function countMetric(
  total: number,
  dates: readonly (Date | null)[],
  now: Date,
  periodDays: number,
  trendWeeks: number,
): CountMetric {
  const periodStart = daysBefore(now, periodDays);
  const previousStart = daysBefore(now, periodDays * 2);
  const count = (start: Date, end: Date) =>
    dates.filter((date) => within(date, start, end)).length;

  const recent = count(periodStart, now);
  const previous = count(previousStart, periodStart);
  const trend = Array.from({ length: trendWeeks }, (_, index) => {
    const end = daysBefore(now, (trendWeeks - 1 - index) * 7);
    return count(daysBefore(end, 7), end);
  });

  return {
    total,
    recent,
    previous,
    change: percentChange(recent, previous),
    trend,
  };
}

/** Share of applications sent by `asOf` that had a response by then. */
function responseRateAsOf(
  applied: readonly Applied[],
  asOf: Date,
): number | null {
  const sent = applied.filter((progress) => progress.appliedAt <= asOf);
  const responded = sent.filter(
    (progress) =>
      progress.firstResponseAt !== null && progress.firstResponseAt <= asOf,
  );
  return ratio(responded.length, sent.length);
}

export function computeOverviewMetrics(
  progress: readonly ApplicationProgress[],
  now: Date,
  {
    periodDays = OVERVIEW_PERIOD_DAYS,
    trendWeeks = OVERVIEW_TREND_WEEKS,
  }: { periodDays?: number; trendWeeks?: number } = {},
): OverviewMetrics {
  const applied = progress.filter(isApplied);
  const funnel = computeFunnel(applied);
  const metric = (total: number, dates: (Date | null)[]) =>
    countMetric(total, dates, now, periodDays, trendWeeks);

  const value = ratio(funnel.responses, funnel.applications);
  const previous = responseRateAsOf(applied, daysBefore(now, periodDays));

  return {
    applications: metric(
      funnel.applications,
      applied.map((p) => p.appliedAt),
    ),
    interviews: metric(
      funnel.interviews,
      applied.map((p) => p.interviewAt),
    ),
    offers: metric(
      funnel.offers,
      applied.map((p) => p.offerAt),
    ),
    responseRate: {
      value,
      previous,
      change: percentagePointChange(value, previous),
      numerator: funnel.responses,
      denominator: funnel.applications,
      trend: Array.from({ length: trendWeeks }, (_, index) =>
        responseRateAsOf(
          applied,
          daysBefore(now, (trendWeeks - 1 - index) * 7),
        ),
      ),
    },
  };
}

export const FUNNEL_PERIODS = {
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  all: { label: "All time", days: null },
} as const satisfies Record<string, { label: string; days: number | null }>;

export type FunnelPeriod = keyof typeof FUNNEL_PERIODS;

/** The funnel for applications sent within the period (a cohort). */
export function funnelForPeriod(
  progress: readonly ApplicationProgress[],
  period: FunnelPeriod,
  now: Date,
): Funnel {
  const { days } = FUNNEL_PERIODS[period];
  const since = days === null ? null : daysBefore(now, days);
  return computeFunnel(
    progress
      .filter(isApplied)
      .filter((p) => since === null || within(p.appliedAt, since, now)),
  );
}
