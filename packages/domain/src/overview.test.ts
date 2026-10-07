import { describe, expect, it } from "vitest";
import type { ApplicationProgress } from "./analytics";
import { computeOverviewMetrics, funnelForPeriod } from "./overview";

const now = new Date(Date.UTC(2026, 9, 31, 12));
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const progress = (
  appliedDaysAgo: number | null,
  {
    respondedDaysAgo = null,
    interviewDaysAgo = null,
    offerDaysAgo = null,
  }: {
    respondedDaysAgo?: number | null;
    interviewDaysAgo?: number | null;
    offerDaysAgo?: number | null;
  } = {},
): ApplicationProgress => ({
  appliedAt: appliedDaysAgo === null ? null : daysAgo(appliedDaysAgo),
  firstResponseAt: respondedDaysAgo === null ? null : daysAgo(respondedDaysAgo),
  reachedInterview: interviewDaysAgo !== null || offerDaysAgo !== null,
  reachedFinalRound: offerDaysAgo !== null,
  reachedOffer: offerDaysAgo !== null,
  interviewAt: interviewDaysAgo === null ? null : daysAgo(interviewDaysAgo),
  offerAt: offerDaysAgo === null ? null : daysAgo(offerDaysAgo),
  rejected: false,
});

describe("computeOverviewMetrics", () => {
  it("counts applications all time, in the last 30 days and the 30 before", () => {
    const { applications } = computeOverviewMetrics(
      [
        progress(5),
        progress(10),
        progress(20),
        progress(40),
        progress(50),
        progress(70),
        progress(null), // saved, never applied
      ],
      now,
    );
    expect(applications).toMatchObject({
      total: 6,
      recent: 3,
      previous: 2,
      change: 0.5,
    });
  });

  it("puts a moment on a window edge in exactly one window", () => {
    const { applications } = computeOverviewMetrics(
      [progress(0), progress(30), progress(60)],
      now,
    );
    expect(applications.recent).toBe(1);
    expect(applications.previous).toBe(1);
  });

  it("has no change without a baseline", () => {
    const { offers } = computeOverviewMetrics(
      [progress(10, { respondedDaysAgo: 8, offerDaysAgo: 2 })],
      now,
    );
    expect(offers).toMatchObject({
      total: 1,
      recent: 1,
      previous: 0,
      change: null,
    });
  });

  it("dates interviews and offers by when they were reached", () => {
    const { interviews, offers } = computeOverviewMetrics(
      [
        // Applied long ago, interviewed recently: a recent interview.
        progress(80, { respondedDaysAgo: 20, interviewDaysAgo: 12 }),
        progress(45, { respondedDaysAgo: 40, interviewDaysAgo: 35 }),
        progress(50, {
          respondedDaysAgo: 48,
          interviewDaysAgo: 44,
          offerDaysAgo: 3,
        }),
        progress(5),
      ],
      now,
    );
    expect(interviews).toMatchObject({ total: 3, recent: 1, previous: 2 });
    expect(offers).toMatchObject({ total: 1, recent: 1, previous: 0 });
  });

  it("builds a weekly trend that ends now", () => {
    const { applications } = computeOverviewMetrics(
      [progress(1), progress(2), progress(7), progress(8), progress(90)],
      now,
    );
    expect(applications.trend).toHaveLength(12);
    expect(applications.trend.at(-1)).toBe(2);
    // Exactly seven days ago belongs to the week before.
    expect(applications.trend.at(-2)).toBe(2);
    // Older than 12 weeks falls outside the trend.
    expect(applications.trend.reduce((sum, n) => sum + n, 0)).toBe(4);
  });

  it("compares the response rate with 30 days ago in points", () => {
    const { responseRate } = computeOverviewMetrics(
      [
        progress(50, { respondedDaysAgo: 45 }),
        progress(40),
        // Responded after the comparison date, so it only counts now.
        progress(35, { respondedDaysAgo: 10 }),
        progress(20, { respondedDaysAgo: 5 }),
      ],
      now,
    );
    expect(responseRate.value).toBe(0.75);
    expect(responseRate.previous).toBeCloseTo(1 / 3);
    expect(responseRate.change).toBeCloseTo(75 - 100 / 3);
    expect(responseRate).toMatchObject({ numerator: 3, denominator: 4 });
  });

  it("has no response rate trend before the first application", () => {
    const { responseRate } = computeOverviewMetrics(
      [progress(10, { respondedDaysAgo: 3 })],
      now,
    );
    expect(responseRate.trend.slice(0, 10)).toEqual(Array(10).fill(null));
    expect(responseRate.trend.slice(-2)).toEqual([0, 1]);
  });

  it("handles an empty workspace", () => {
    const metrics = computeOverviewMetrics([], now);
    expect(metrics.applications).toEqual({
      total: 0,
      recent: 0,
      previous: 0,
      change: null,
      trend: Array(12).fill(0),
    });
    expect(metrics.responseRate.value).toBeNull();
    expect(metrics.responseRate.change).toBeNull();
  });
});

describe("funnelForPeriod", () => {
  const cohort = [
    progress(10, { respondedDaysAgo: 5, interviewDaysAgo: 3 }),
    progress(20),
    progress(60, { respondedDaysAgo: 50 }),
    progress(120, {
      respondedDaysAgo: 110,
      interviewDaysAgo: 100,
      offerDaysAgo: 90,
    }),
    progress(null),
  ];

  it("includes applications sent within the period", () => {
    expect(funnelForPeriod(cohort, "30d", now)).toMatchObject({
      applications: 2,
      responses: 1,
      interviews: 1,
      offers: 0,
    });
    expect(funnelForPeriod(cohort, "90d", now)).toMatchObject({
      applications: 3,
      responses: 2,
    });
  });

  it("covers every application sent for all time", () => {
    expect(funnelForPeriod(cohort, "all", now)).toEqual({
      applications: 4,
      responses: 3,
      interviews: 2,
      finalRounds: 1,
      offers: 1,
    });
  });
});
