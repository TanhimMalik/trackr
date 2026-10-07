import { describe, expect, it } from "vitest";
import { parseEventMetadata } from "./events";

describe("parseEventMetadata", () => {
  it("requires a target status for overrides", () => {
    expect(
      parseEventMetadata("STATUS_OVERRIDDEN", { toStatus: "INTERVIEW" }),
    ).toEqual({ toStatus: "INTERVIEW" });
    expect(() => parseEventMetadata("STATUS_OVERRIDDEN", {})).toThrow();
    expect(() =>
      parseEventMetadata("STATUS_OVERRIDDEN", { toStatus: "HIRED" }),
    ).toThrow();
  });

  it("validates interview details", () => {
    expect(
      parseEventMetadata("INTERVIEW_SCHEDULED", {
        interviewKind: "TECHNICAL",
        scheduledAt: "2026-10-12T15:00:00-04:00",
        isFinalRound: false,
      }),
    ).toEqual({
      interviewKind: "TECHNICAL",
      scheduledAt: "2026-10-12T15:00:00-04:00",
      isFinalRound: false,
    });
    expect(() =>
      parseEventMetadata("INTERVIEW_SCHEDULED", { scheduledAt: "next week" }),
    ).toThrow();
  });

  it("treats missing metadata as empty", () => {
    expect(parseEventMetadata("APPLICATION_SUBMITTED", undefined)).toEqual({});
    expect(parseEventMetadata("NEXT_ROUND", null)).toEqual({});
  });

  it("strips keys that are not part of the event's metadata", () => {
    expect(
      parseEventMetadata("REJECTION_RECEIVED", { emailBody: "Unfortunately…" }),
    ).toEqual({});
  });
});
