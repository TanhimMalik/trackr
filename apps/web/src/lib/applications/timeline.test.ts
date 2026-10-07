import { describe, expect, it } from "vitest";
import { describeEvent, eventActionFor, type TimelineEvent } from "./timeline";

const event = (overrides: Partial<TimelineEvent>): TimelineEvent => ({
  eventType: "APPLICATION_SUBMITTED",
  sourceType: "MANUAL",
  classificationMethod: null,
  confidence: null,
  metadata: {},
  statusBefore: "UNKNOWN",
  statusAfter: "APPLIED",
  revertedAt: null,
  ...overrides,
});

describe("describeEvent", () => {
  it("describes a manual submission without a transition", () => {
    expect(describeEvent(event({}))).toEqual({
      title: "Applied",
      detail: null,
      transition: null,
      source: {
        label: "Manual",
        automatic: false,
        aiClassified: false,
        confidence: null,
      },
      reverted: false,
    });
  });

  it("shows the status change and confidence of an email update", () => {
    const entry = describeEvent(
      event({
        eventType: "INTERVIEW_SCHEDULED",
        sourceType: "EMAIL",
        classificationMethod: "RULES",
        confidence: 0.964,
        metadata: { interviewKind: "TECHNICAL" },
        statusBefore: "ASSESSMENT",
        statusAfter: "INTERVIEW",
      }),
    );
    expect(entry).toMatchObject({
      title: "Interview scheduled",
      detail: "Technical interview",
      transition: { from: "ASSESSMENT", to: "INTERVIEW" },
      source: {
        label: "Gmail",
        automatic: true,
        aiClassified: false,
        confidence: 96,
      },
    });
  });

  it("marks updates classified by the language model", () => {
    const entry = describeEvent(
      event({
        eventType: "RECRUITER_CONTACT",
        sourceType: "EMAIL",
        classificationMethod: "LLM",
        confidence: 0.86,
        statusBefore: "APPLIED",
        statusAfter: "RECRUITER_SCREEN",
      }),
    );
    expect(entry.source).toMatchObject({ aiClassified: true, confidence: 86 });
  });

  it("names the target of a manual status change", () => {
    expect(
      describeEvent(
        event({
          eventType: "STATUS_OVERRIDDEN",
          metadata: { toStatus: "OFFER" },
          statusBefore: "INTERVIEW",
          statusAfter: "OFFER",
        }),
      ).title,
    ).toBe("Status changed to Offer");
  });

  it("calls out a final round", () => {
    expect(
      describeEvent(
        event({ eventType: "NEXT_ROUND", metadata: { isFinalRound: true } }),
      ).title,
    ).toBe("Moved to the final round");
  });

  it("omits the transition when the status did not change", () => {
    expect(
      describeEvent(
        event({
          eventType: "APPLICATION_CONFIRMATION_RECEIVED",
          sourceType: "EMAIL",
          statusBefore: "INTERVIEW",
          statusAfter: "INTERVIEW",
        }),
      ).transition,
    ).toBeNull();
  });

  it("flags undone events", () => {
    expect(describeEvent(event({ revertedAt: new Date() })).reverted).toBe(
      true,
    );
  });

  it("ignores malformed metadata", () => {
    const entry = describeEvent(
      event({
        eventType: "INTERVIEW_REQUESTED",
        metadata: { interviewKind: "ROOFTOP" },
      }),
    );
    expect(entry.detail).toBeNull();
  });
});

describe("eventActionFor", () => {
  it("offers undo while other events remain", () => {
    expect(eventActionFor({ revertedAt: null }, 3)).toBe("undo");
    expect(eventActionFor({ revertedAt: null }, 1)).toBeNull();
  });

  it("offers restore for undone events", () => {
    expect(eventActionFor({ revertedAt: new Date() }, 1)).toBe("restore");
  });
});
