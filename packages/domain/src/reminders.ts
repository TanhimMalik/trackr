import type { ApplicationStatus } from "./enums";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days of silence after an applied application before suggesting a follow-up. */
export const DEFAULT_FOLLOW_UP_AFTER_DAYS = 14;
export const FOLLOW_UP_AFTER_DAY_OPTIONS = [7, 10, 14, 21, 30] as const;
/** Days after an interview with no reply before suggesting a thank-you or check-in. */
export const INTERVIEW_FOLLOW_UP_AFTER_DAYS = 5;
/** Reminders that came due longer ago than this aren't worth raising. */
export const REMINDER_LOOKBACK_DAYS = 30;

export type ReminderCandidate = {
  id: string;
  companyName: string;
  status: ApplicationStatus;
  lastActivityAt: Date;
  /** The most recent interview that wasn't canceled, if it has a time. */
  latestInterview: { id: string; scheduledAt: Date } | null;
};

export type FollowUpReminder = {
  applicationId: string;
  kind: "NO_RESPONSE" | "AFTER_INTERVIEW";
  title: string;
  /** When the reminder came due. */
  dueAt: Date;
  /** One reminder per quiet stretch; any new activity starts a new one. */
  dedupeKey: string;
};

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

function reminderFor(
  application: ReminderCandidate,
  afterDays: number,
): FollowUpReminder | null {
  const { id, companyName, status, lastActivityAt, latestInterview } =
    application;

  if (status === "APPLIED") {
    return {
      applicationId: id,
      kind: "NO_RESPONSE",
      title: `${companyName} hasn't responded in ${afterDays} days`,
      dueAt: addDays(lastActivityAt, afterDays),
      dedupeKey: `stale:${id}:${lastActivityAt.toISOString()}`,
    };
  }

  // Interviewed, and nothing has happened since.
  if (
    (status === "INTERVIEW" || status === "FINAL_ROUND") &&
    latestInterview &&
    lastActivityAt <= latestInterview.scheduledAt
  ) {
    const { scheduledAt } = latestInterview;
    return {
      applicationId: id,
      kind: "AFTER_INTERVIEW",
      title: `No reply from ${companyName} ${INTERVIEW_FOLLOW_UP_AFTER_DAYS} days after your interview`,
      dueAt: addDays(scheduledAt, INTERVIEW_FOLLOW_UP_AFTER_DAYS),
      dedupeKey: `interview:${latestInterview.id}:${scheduledAt.toISOString()}`,
    };
  }

  return null;
}

/**
 * The follow-ups worth suggesting right now: applications that went quiet
 * after applying, and interviews nobody has replied to. Trackr only suggests;
 * it never sends anything.
 */
export function followUpReminders(
  applications: ReminderCandidate[],
  { afterDays }: { afterDays: number },
  now: Date,
): FollowUpReminder[] {
  const oldest = addDays(now, -REMINDER_LOOKBACK_DAYS);
  return applications.flatMap((application) => {
    const reminder = reminderFor(application, afterDays);
    if (!reminder || reminder.dueAt > now || reminder.dueAt < oldest) {
      return [];
    }
    return [reminder];
  });
}
