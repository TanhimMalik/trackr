import { describe, expect, it } from "vitest";
import {
  averageDaysToResponse,
  computeFunnel,
  computeRates,
  percentagePointChange,
  percentChange,
  summarizeProgress,
  type ApplicationProgress,
  type ProgressEvent,
} from "./analytics";
import type { ApplicationStatus } from "./enums";

const day = (d: number) => new Date(Date.UTC(2026, 9, d, 12));

const progressFor = (
  currentStatus: ApplicationStatus,
  events: ProgressEvent[],
  appliedDay = 1,
) => summarizeProgress({ appliedAt: day(appliedDay), currentStatus, events });

const submitted: ProgressEvent = {
  type: "APPLICATION_SUBMITTED",
  occurredAt: day(1),
  statusAfter: "APPLIED",
};
const confirmed: ProgressEvent = {
  type: "APPLICATION_CONFIRMATION_RECEIVED",
  occurredAt: day(1),
  statusAfter: "APPLIED",
};

describe("summarizeProgress", () => {
  it("does not count the automatic confirmation as a response", () => {
    const progress = progressFor("APPLIED", [submitted, confirmed]);
    expect(progress.firstResponseAt).toBeNull();
    expect(progress.reachedInterview).toBe(false);
  });

  it("records the earliest company response", () => {
    const progress = progressFor("INTERVIEW", [
      submitted,
      {
        type: "INTERVIEW_REQUESTED",
        occurredAt: day(9),
        statusAfter: "INTERVIEW",
      },
      {
        type: "RECRUITER_CONTACT",
        occurredAt: day(5),
        statusAfter: "RECRUITER_SCREEN",
      },
    ]);
    expect(progress.firstResponseAt).toEqual(day(5));
    expect(progress.reachedInterview).toBe(true);
  });

  it("counts a rejection as a response", () => {
    const progress = progressFor("REJECTED", [
      submitted,
      {
        type: "REJECTION_RECEIVED",
        occurredAt: day(12),
        statusAfter: "REJECTED",
      },
    ]);
    expect(progress.firstResponseAt).toEqual(day(12));
    expect(progress.rejected).toBe(true);
    expect(progress.reachedInterview).toBe(false);
  });

  it("counts a manual move to an interview stage", () => {
    const progress = progressFor("INTERVIEW", [
      submitted,
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(7),
        statusAfter: "INTERVIEW",
      },
    ]);
    expect(progress.firstResponseAt).toEqual(day(7));
    expect(progress.reachedInterview).toBe(true);
  });

  it("does not count follow-ups or a manual move back to applied", () => {
    const progress = progressFor("APPLIED", [
      submitted,
      { type: "FOLLOW_UP_SENT", occurredAt: day(15), statusAfter: "APPLIED" },
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(16),
        statusAfter: "APPLIED",
      },
    ]);
    expect(progress.firstResponseAt).toBeNull();
  });

  it("remembers an interview even after a rejection", () => {
    const progress = progressFor("REJECTED", [
      submitted,
      {
        type: "INTERVIEW_REQUESTED",
        occurredAt: day(5),
        statusAfter: "INTERVIEW",
      },
      {
        type: "REJECTION_RECEIVED",
        occurredAt: day(20),
        statusAfter: "REJECTED",
      },
    ]);
    expect(progress.reachedInterview).toBe(true);
    expect(progress.reachedFinalRound).toBe(false);
    expect(progress.rejected).toBe(true);
  });

  it("records when it first reached an interview stage and an offer", () => {
    const progress = progressFor("OFFER", [
      submitted,
      {
        type: "RECRUITER_CONTACT",
        occurredAt: day(4),
        statusAfter: "RECRUITER_SCREEN",
      },
      {
        type: "INTERVIEW_SCHEDULED",
        occurredAt: day(9),
        statusAfter: "INTERVIEW",
      },
      { type: "NEXT_ROUND", occurredAt: day(14), statusAfter: "FINAL_ROUND" },
      { type: "OFFER_RECEIVED", occurredAt: day(21), statusAfter: "OFFER" },
    ]);
    expect(progress.interviewAt).toEqual(day(9));
    expect(progress.offerAt).toEqual(day(21));
  });

  it("has no stage dates before reaching those stages", () => {
    const progress = progressFor("ASSESSMENT", [
      submitted,
      {
        type: "ASSESSMENT_RECEIVED",
        occurredAt: day(3),
        statusAfter: "ASSESSMENT",
      },
    ]);
    expect(progress.interviewAt).toBeNull();
    expect(progress.offerAt).toBeNull();
  });

  it("ignores a manual move that was taken back", () => {
    const progress = progressFor("APPLIED", [
      submitted,
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(6),
        statusAfter: "INTERVIEW",
      },
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(6),
        statusAfter: "APPLIED",
      },
    ]);
    expect(progress.firstResponseAt).toBeNull();
    expect(progress.reachedInterview).toBe(false);
    expect(progress.interviewAt).toBeNull();
  });

  it("ignores a closing that was reopened", () => {
    const progress = progressFor("APPLIED", [
      submitted,
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(4),
        statusAfter: "REJECTED",
      },
      { type: "STATUS_OVERRIDDEN", occurredAt: day(5), statusAfter: "APPLIED" },
    ]);
    expect(progress.firstResponseAt).toBeNull();
  });

  it("keeps manual moves forward and closings that stand", () => {
    const progress = progressFor("REJECTED", [
      submitted,
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(5),
        statusAfter: "ASSESSMENT",
      },
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(9),
        statusAfter: "INTERVIEW",
      },
      {
        type: "STATUS_OVERRIDDEN",
        occurredAt: day(14),
        statusAfter: "REJECTED",
      },
    ]);
    expect(progress.firstResponseAt).toEqual(day(5));
    expect(progress.interviewAt).toEqual(day(9));
    expect(progress.rejected).toBe(true);
  });

  it("keeps company responses even when the person moves the card back", () => {
    const progress = progressFor("APPLIED", [
      submitted,
      {
        type: "ASSESSMENT_RECEIVED",
        occurredAt: day(3),
        statusAfter: "ASSESSMENT",
      },
      { type: "STATUS_OVERRIDDEN", occurredAt: day(4), statusAfter: "APPLIED" },
    ]);
    expect(progress.firstResponseAt).toEqual(day(3));
  });

  it("treats an offer as having passed the earlier stages", () => {
    const progress = progressFor("OFFER", [
      submitted,
      { type: "OFFER_RECEIVED", occurredAt: day(30), statusAfter: "OFFER" },
    ]);
    expect(progress).toMatchObject({
      reachedInterview: true,
      reachedFinalRound: true,
      reachedOffer: true,
    });
  });
});

describe("funnel and rates", () => {
  const cohort: ApplicationProgress[] = [
    progressFor("APPLIED", [submitted]),
    progressFor("APPLIED", [submitted]),
    progressFor("REJECTED", [
      submitted,
      {
        type: "REJECTION_RECEIVED",
        occurredAt: day(4),
        statusAfter: "REJECTED",
      },
    ]),
    progressFor("INTERVIEW", [
      submitted,
      {
        type: "INTERVIEW_REQUESTED",
        occurredAt: day(6),
        statusAfter: "INTERVIEW",
      },
    ]),
    progressFor("OFFER", [
      submitted,
      {
        type: "INTERVIEW_REQUESTED",
        occurredAt: day(3),
        statusAfter: "INTERVIEW",
      },
      { type: "NEXT_ROUND", occurredAt: day(10), statusAfter: "FINAL_ROUND" },
      { type: "OFFER_RECEIVED", occurredAt: day(20), statusAfter: "OFFER" },
    ]),
  ];

  it("counts each funnel stage", () => {
    expect(computeFunnel(cohort)).toEqual({
      applications: 5,
      responses: 3,
      interviews: 2,
      finalRounds: 1,
      offers: 1,
    });
  });

  it("keeps the funnel nested", () => {
    const funnel = computeFunnel(cohort);
    expect(funnel.responses).toBeLessThanOrEqual(funnel.applications);
    expect(funnel.interviews).toBeLessThanOrEqual(funnel.responses);
    expect(funnel.finalRounds).toBeLessThanOrEqual(funnel.interviews);
    expect(funnel.offers).toBeLessThanOrEqual(funnel.finalRounds);
  });

  it("computes rates over all applications", () => {
    expect(computeRates(cohort)).toEqual({
      responseRate: 0.6,
      interviewRate: 0.4,
      offerRate: 0.2,
      rejectionRate: 0.2,
    });
  });

  it("returns no rates for an empty period", () => {
    expect(computeRates([])).toEqual({
      responseRate: null,
      interviewRate: null,
      offerRate: null,
      rejectionRate: null,
    });
  });

  it("averages days to first response over applications that got one", () => {
    // Responses after 3, 2 and 5 days.
    expect(averageDaysToResponse(cohort)).toBeCloseTo(10 / 3);
    expect(
      averageDaysToResponse([progressFor("APPLIED", [submitted])]),
    ).toBeNull();
  });
});

describe("period comparisons", () => {
  it("computes relative change for counts", () => {
    expect(percentChange(56, 50)).toBeCloseTo(0.12);
    expect(percentChange(8, 6)).toBeCloseTo(1 / 3);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("computes percentage-point change for rates", () => {
    expect(percentagePointChange(0.24, 0.18)).toBeCloseTo(6);
    expect(percentagePointChange(null, 0.2)).toBeNull();
  });
});
