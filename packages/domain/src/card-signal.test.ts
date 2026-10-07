import { describe, expect, it } from "vitest";
import { cardSignal } from "./card-signal";

describe("cardSignal", () => {
  it("prefers the latest informative event", () => {
    expect(
      cardSignal({
        latestSignalEvent: { type: "INTERVIEW_SCHEDULED" },
        originEvent: { sourceType: "EMAIL" },
        source: "LINKEDIN",
      }),
    ).toEqual({
      kind: "event",
      eventType: "INTERVIEW_SCHEDULED",
      label: "Interview scheduled",
    });
  });

  it("labels a final round", () => {
    expect(
      cardSignal({
        latestSignalEvent: {
          type: "NEXT_ROUND",
          metadata: { isFinalRound: true },
        },
        originEvent: null,
        source: null,
      })?.label,
    ).toBe("Final round");
  });

  it("falls back to how the application was captured", () => {
    expect(
      cardSignal({
        latestSignalEvent: null,
        originEvent: { sourceType: "EMAIL" },
        source: "LINKEDIN",
      }),
    ).toEqual({ kind: "origin", sourceType: "EMAIL", label: "Gmail detected" });
    expect(
      cardSignal({
        latestSignalEvent: null,
        originEvent: { sourceType: "BROWSER_EXTENSION" },
        source: null,
      })?.label,
    ).toBe("Captured by extension");
  });

  it("falls back to where the job was found for manual entries", () => {
    expect(
      cardSignal({
        latestSignalEvent: null,
        originEvent: { sourceType: "MANUAL" },
        source: "REFERRAL",
      }),
    ).toEqual({ kind: "source", source: "REFERRAL", label: "Referral" });
  });

  it("returns nothing when there is nothing useful to say", () => {
    expect(
      cardSignal({
        latestSignalEvent: null,
        originEvent: { sourceType: "MANUAL" },
        source: null,
      }),
    ).toBeNull();
  });
});
