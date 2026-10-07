import { describe, expect, it } from "vitest";
import { notificationForEvent, type NotifiableEvent } from "./notifications";

const fromEmail = (event: Partial<NotifiableEvent>): NotifiableEvent => ({
  type: "NEXT_ROUND",
  sourceType: "EMAIL",
  statusBefore: "APPLIED",
  statusAfter: "INTERVIEW",
  ...event,
});

describe("notificationForEvent", () => {
  it("announces a status change detected from email", () => {
    expect(notificationForEvent(fromEmail({}), "Figma")).toEqual({
      type: "STATUS_CHANGED",
      title: "Figma moved to Interview",
    });
  });

  it("words confirmations, offers and rejections", () => {
    expect(
      notificationForEvent(
        fromEmail({
          type: "APPLICATION_CONFIRMATION_RECEIVED",
          statusBefore: "SAVED",
          statusAfter: "APPLIED",
        }),
        "Shopify",
      )?.title,
    ).toBe("Shopify confirmed your application");
    expect(
      notificationForEvent(
        fromEmail({ type: "OFFER_RECEIVED", statusAfter: "OFFER" }),
        "Stripe",
      )?.title,
    ).toBe("Stripe sent you an offer");
    expect(
      notificationForEvent(
        fromEmail({ type: "REJECTION_RECEIVED", statusAfter: "REJECTED" }),
        "Google",
      )?.title,
    ).toBe("Google application marked Rejected");
  });

  it("announces assessments and interviews even without a status change", () => {
    expect(
      notificationForEvent(
        fromEmail({
          type: "ASSESSMENT_RECEIVED",
          statusBefore: "ASSESSMENT",
          statusAfter: "ASSESSMENT",
        }),
        "Datadog",
      ),
    ).toEqual({
      type: "ASSESSMENT_RECEIVED",
      title: "Datadog sent you an assessment",
    });
    expect(
      notificationForEvent(
        fromEmail({
          type: "INTERVIEW_RESCHEDULED",
          statusBefore: "INTERVIEW",
          statusAfter: "INTERVIEW",
        }),
        "Ramp",
      ),
    ).toEqual({
      type: "INTERVIEW_SCHEDULED",
      title: "Ramp rescheduled your interview",
    });
  });

  it("stays quiet when nothing changed", () => {
    expect(
      notificationForEvent(
        fromEmail({
          type: "APPLICATION_CONFIRMATION_RECEIVED",
          statusAfter: "APPLIED",
        }),
        "Linear",
      ),
    ).toBeNull();
    expect(
      notificationForEvent(fromEmail({ statusAfter: null }), "Linear"),
    ).toBeNull();
  });

  it("ignores changes the person made or captured themselves", () => {
    expect(
      notificationForEvent(fromEmail({ sourceType: "MANUAL" }), "Figma"),
    ).toBeNull();
    expect(
      notificationForEvent(
        fromEmail({ sourceType: "BROWSER_EXTENSION" }),
        "Figma",
      ),
    ).toBeNull();
  });
});
