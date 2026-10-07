import { describe, expect, it } from "vitest";
import type { ApplicationEventType, ApplicationStatus } from "./enums";
import {
  deriveApplicationState,
  transition,
  type PipelineStatus,
  type StatusEvent,
} from "./status";

const day = (d: number, hour = 12) => new Date(Date.UTC(2026, 9, d, hour));

let sequence = 0;
function event(
  type: ApplicationEventType,
  occurredDay: number,
  overrides: Partial<StatusEvent> = {},
): StatusEvent {
  sequence += 1;
  return {
    id: `evt-${String(sequence).padStart(4, "0")}`,
    type,
    occurredAt: day(occurredDay),
    recordedAt: day(occurredDay),
    sourceType: "EMAIL",
    ...overrides,
  };
}

const apply = (status: ApplicationStatus, e: StatusEvent) =>
  transition(status, e);

describe("transition", () => {
  it("moves forward through the pipeline", () => {
    expect(apply("APPLIED", event("ASSESSMENT_RECEIVED", 1))).toBe(
      "ASSESSMENT",
    );
    expect(apply("APPLIED", event("INTERVIEW_REQUESTED", 1))).toBe("INTERVIEW");
    expect(apply("ASSESSMENT", event("INTERVIEW_REQUESTED", 1))).toBe(
      "INTERVIEW",
    );
    expect(apply("SAVED", event("APPLICATION_SUBMITTED", 1))).toBe("APPLIED");
  });

  it("never moves backward automatically", () => {
    expect(
      apply("INTERVIEW", event("APPLICATION_CONFIRMATION_RECEIVED", 1)),
    ).toBe("INTERVIEW");
    expect(apply("FINAL_ROUND", event("INTERVIEW_SCHEDULED", 1))).toBe(
      "FINAL_ROUND",
    );
    expect(apply("INTERVIEW", event("RECRUITER_CONTACT", 1))).toBe("INTERVIEW");
  });

  it("allows lateral moves between assessment and recruiter screen", () => {
    expect(apply("ASSESSMENT", event("RECRUITER_CONTACT", 1))).toBe(
      "RECRUITER_SCREEN",
    );
    expect(apply("RECRUITER_SCREEN", event("ASSESSMENT_RECEIVED", 1))).toBe(
      "ASSESSMENT",
    );
  });

  it("moves to the final round only when the round is flagged as final", () => {
    expect(apply("INTERVIEW", event("NEXT_ROUND", 1))).toBe("INTERVIEW");
    expect(
      apply(
        "INTERVIEW",
        event("NEXT_ROUND", 1, { metadata: { isFinalRound: true } }),
      ),
    ).toBe("FINAL_ROUND");
    expect(
      apply(
        "APPLIED",
        event("INTERVIEW_SCHEDULED", 1, { metadata: { isFinalRound: true } }),
      ),
    ).toBe("FINAL_ROUND");
  });

  const activeStatuses: PipelineStatus[] = [
    "UNKNOWN",
    "SAVED",
    "APPLIED",
    "ASSESSMENT",
    "RECRUITER_SCREEN",
    "INTERVIEW",
    "FINAL_ROUND",
  ];

  it.each(activeStatuses)("applies a rejection from %s", (status) => {
    expect(apply(status, event("REJECTION_RECEIVED", 1))).toBe("REJECTED");
  });

  it.each(activeStatuses)("applies an offer from %s", (status) => {
    expect(apply(status, event("OFFER_RECEIVED", 1))).toBe("OFFER");
  });

  it("does not let automatic events change a final status", () => {
    expect(apply("OFFER", event("APPLICATION_CONFIRMATION_RECEIVED", 1))).toBe(
      "OFFER",
    );
    expect(apply("OFFER", event("REJECTION_RECEIVED", 1))).toBe("OFFER");
    expect(apply("REJECTED", event("INTERVIEW_REQUESTED", 1))).toBe("REJECTED");
    expect(
      apply(
        "WITHDRAWN",
        event("OFFER_RECEIVED", 1, { sourceType: "BROWSER_EXTENSION" }),
      ),
    ).toBe("WITHDRAWN");
  });

  it("lets manual events change a final status", () => {
    expect(
      apply(
        "OFFER",
        event("APPLICATION_WITHDRAWN", 1, { sourceType: "MANUAL" }),
      ),
    ).toBe("WITHDRAWN");
  });

  it("always applies a status override", () => {
    const override = event("STATUS_OVERRIDDEN", 1, {
      sourceType: "MANUAL",
      metadata: { toStatus: "APPLIED" },
    });
    expect(apply("OFFER", override)).toBe("APPLIED");
    expect(apply("INTERVIEW", override)).toBe("APPLIED");
  });

  it("ignores events that carry no status", () => {
    expect(apply("APPLIED", event("FOLLOW_UP_SENT", 1))).toBe("APPLIED");
    expect(apply("INTERVIEW", event("STATUS_OVERRIDDEN", 1))).toBe("INTERVIEW");
  });
});

describe("deriveApplicationState", () => {
  it("is unknown when there are no events", () => {
    expect(deriveApplicationState([])).toEqual({
      status: "UNKNOWN",
      appliedAt: null,
      lastActivityAt: null,
      transitions: [],
    });
  });

  it("follows the primary flow: submitted, confirmed, interview requested", () => {
    const submitted = event("APPLICATION_SUBMITTED", 2, {
      sourceType: "BROWSER_EXTENSION",
    });
    const confirmed = event("APPLICATION_CONFIRMATION_RECEIVED", 2);
    const interview = event("INTERVIEW_REQUESTED", 9);

    const state = deriveApplicationState([submitted, confirmed, interview]);

    expect(state.status).toBe("INTERVIEW");
    expect(state.appliedAt).toEqual(day(2));
    expect(state.lastActivityAt).toEqual(day(9));
    expect(state.transitions).toEqual([
      { eventId: submitted.id, before: "UNKNOWN", after: "APPLIED" },
      { eventId: confirmed.id, before: "APPLIED", after: "APPLIED" },
      { eventId: interview.id, before: "APPLIED", after: "INTERVIEW" },
    ]);
  });

  it("does not regress when an old confirmation is processed late", () => {
    const submitted = event("APPLICATION_SUBMITTED", 1);
    const interview = event("INTERVIEW_REQUESTED", 9);
    const lateConfirmation = event("APPLICATION_CONFIRMATION_RECEIVED", 2, {
      recordedAt: day(12),
    });

    const state = deriveApplicationState([
      submitted,
      interview,
      lateConfirmation,
    ]);

    expect(state.status).toBe("INTERVIEW");
    expect(state.transitions.map((t) => t.eventId)).toEqual([
      submitted.id,
      lateConfirmation.id,
      interview.id,
    ]);
  });

  it("keeps a rejection when an older interview email arrives afterwards", () => {
    const state = deriveApplicationState([
      event("APPLICATION_SUBMITTED", 1),
      event("INTERVIEW_REQUESTED", 5),
      event("REJECTION_RECEIVED", 20),
      event("INTERVIEW_RESCHEDULED", 6, { recordedAt: day(25) }),
    ]);
    expect(state.status).toBe("REJECTED");
  });

  it("produces the same result regardless of input order", () => {
    const events = [
      event("APPLICATION_SUBMITTED", 1, { sourceType: "BROWSER_EXTENSION" }),
      event("APPLICATION_CONFIRMATION_RECEIVED", 1),
      event("RECRUITER_CONTACT", 4),
      event("ASSESSMENT_RECEIVED", 6),
      event("INTERVIEW_REQUESTED", 10),
      event("FOLLOW_UP_SENT", 12, { sourceType: "MANUAL" }),
      event("NEXT_ROUND", 15, { metadata: { isFinalRound: true } }),
      event("INTERVIEW_SCHEDULED", 16),
      event("OFFER_RECEIVED", 22),
      event("REJECTION_RECEIVED", 23, { recordedAt: day(30) }),
    ];
    const expected = deriveApplicationState(events);
    expect(expected.status).toBe("OFFER");

    // Deterministic shuffles (mulberry32).
    let seed = 42;
    const random = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let round = 0; round < 50; round += 1) {
      const shuffled = [...events];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      expect(deriveApplicationState(shuffled)).toEqual(expected);
    }
  });

  it("excludes reverted events", () => {
    const submitted = event("APPLICATION_SUBMITTED", 1);
    const misclassified = event("INTERVIEW_REQUESTED", 5, {
      revertedAt: day(6),
    });

    const state = deriveApplicationState([submitted, misclassified]);

    expect(state.status).toBe("APPLIED");
    expect(state.lastActivityAt).toEqual(day(1));
    expect(state.transitions.map((t) => t.eventId)).toEqual([submitted.id]);
  });

  it("continues forward from a manual override", () => {
    const state = deriveApplicationState([
      event("APPLICATION_SUBMITTED", 1),
      event("INTERVIEW_REQUESTED", 5),
      event("STATUS_OVERRIDDEN", 6, {
        sourceType: "MANUAL",
        metadata: { toStatus: "APPLIED" },
      }),
      event("ASSESSMENT_RECEIVED", 8),
    ]);
    expect(state.status).toBe("ASSESSMENT");
  });

  it("breaks ties between simultaneous events by recorded time", () => {
    const offer = event("OFFER_RECEIVED", 10, { recordedAt: day(10, 9) });
    const override = event("STATUS_OVERRIDDEN", 10, {
      sourceType: "MANUAL",
      metadata: { toStatus: "INTERVIEW" },
      recordedAt: day(10, 10),
    });
    expect(deriveApplicationState([override, offer]).status).toBe("INTERVIEW");

    const earlierOverride = { ...override, recordedAt: day(10, 8) };
    expect(deriveApplicationState([offer, earlierOverride]).status).toBe(
      "OFFER",
    );
  });

  it("uses the earliest submission or confirmation as the applied date", () => {
    expect(
      deriveApplicationState([event("APPLICATION_CONFIRMATION_RECEIVED", 3)])
        .appliedAt,
    ).toEqual(day(3));
    expect(
      deriveApplicationState([
        event("APPLICATION_CONFIRMATION_RECEIVED", 3),
        event("APPLICATION_SUBMITTED", 2),
      ]).appliedAt,
    ).toEqual(day(2));
    expect(
      deriveApplicationState([event("JOB_SAVED", 1)]).appliedAt,
    ).toBeNull();
  });
});
