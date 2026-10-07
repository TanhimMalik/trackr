import { describe, expect, it } from "vitest";
import { followUpReminders, type ReminderCandidate } from "./reminders";

const now = new Date("2026-10-07T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const candidate = (fields: Partial<ReminderCandidate>): ReminderCandidate => ({
  id: "app-1",
  companyName: "Stripe",
  status: "APPLIED",
  lastActivityAt: daysAgo(16),
  latestInterview: null,
  ...fields,
});

const remind = (fields: Partial<ReminderCandidate>, afterDays = 14) =>
  followUpReminders([candidate(fields)], { afterDays }, now);

describe("followUpReminders", () => {
  it("suggests following up on a quiet application", () => {
    expect(remind({})).toEqual([
      {
        applicationId: "app-1",
        kind: "NO_RESPONSE",
        title: "Stripe hasn't responded in 14 days",
        dueAt: daysAgo(2),
        dedupeKey: `stale:app-1:${daysAgo(16).toISOString()}`,
      },
    ]);
  });

  it("waits for the configured number of days", () => {
    expect(remind({ lastActivityAt: daysAgo(10) })).toEqual([]);
    expect(remind({ lastActivityAt: daysAgo(10) }, 7)[0]?.title).toBe(
      "Stripe hasn't responded in 7 days",
    );
  });

  it("only reminds about applications still waiting to hear back", () => {
    for (const status of [
      "SAVED",
      "ASSESSMENT",
      "OFFER",
      "REJECTED",
    ] as const) {
      expect(remind({ status })).toEqual([]);
    }
  });

  it("suggests a follow-up after an interview with no reply", () => {
    const scheduledAt = daysAgo(6);
    expect(
      remind({
        status: "INTERVIEW",
        lastActivityAt: daysAgo(12),
        latestInterview: { id: "int-1", scheduledAt },
      }),
    ).toEqual([
      {
        applicationId: "app-1",
        kind: "AFTER_INTERVIEW",
        title: "No reply from Stripe 5 days after your interview",
        dueAt: daysAgo(1),
        dedupeKey: `interview:int-1:${scheduledAt.toISOString()}`,
      },
    ]);
  });

  it("stays quiet when something happened after the interview", () => {
    expect(
      remind({
        status: "INTERVIEW",
        lastActivityAt: daysAgo(2),
        latestInterview: { id: "int-1", scheduledAt: daysAgo(6) },
      }),
    ).toEqual([]);
  });

  it("stays quiet before the interview has had time for a reply", () => {
    expect(
      remind({
        status: "FINAL_ROUND",
        lastActivityAt: daysAgo(9),
        latestInterview: { id: "int-1", scheduledAt: daysAgo(3) },
      }),
    ).toEqual([]);
  });

  it("drops reminders that came due long ago", () => {
    expect(remind({ lastActivityAt: daysAgo(60) })).toEqual([]);
  });
});
