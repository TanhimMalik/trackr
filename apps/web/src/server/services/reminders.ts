import "server-only";
import { followUpReminders, type ReminderCandidate } from "@trackr/domain";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  applications,
  interviews,
  notifications,
  userSettings,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";

const HOUR_MS = 60 * 60 * 1000;
/** How often reminders are looked for while someone is using Trackr. */
const REMINDER_CHECK_INTERVAL_MS = HOUR_MS;

/**
 * Writes a notification for every follow-up that is due. Safe to run any
 * number of times: each quiet stretch is reminded about once.
 * `readBefore` files reminders that came due before it as already read.
 */
export async function generateFollowUpReminders(
  userId: string,
  {
    now = new Date(),
    afterDays,
    readBefore,
  }: { now?: Date; afterDays: number; readBefore?: Date },
  db: Database = getDb(),
): Promise<number> {
  const waiting = await db
    .select({
      id: applications.id,
      companyName: applications.companyName,
      jobTitle: applications.jobTitle,
      status: applications.currentStatus,
      lastActivityAt: applications.lastActivityAt,
    })
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        inArray(applications.currentStatus, [
          "APPLIED",
          "INTERVIEW",
          "FINAL_ROUND",
        ]),
      ),
    );
  if (waiting.length === 0) return 0;

  // The latest interview per application that wasn't canceled.
  const latest = await db
    .selectDistinctOn([interviews.applicationId], {
      applicationId: interviews.applicationId,
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
    })
    .from(interviews)
    .where(
      and(
        eq(interviews.userId, userId),
        isNotNull(interviews.scheduledAt),
        ne(interviews.status, "CANCELED"),
      ),
    )
    .orderBy(interviews.applicationId, sql`${interviews.scheduledAt} desc`);
  const latestInterview = new Map(
    latest.map((row) => [
      row.applicationId,
      { id: row.id, scheduledAt: row.scheduledAt! },
    ]),
  );

  const candidates: ReminderCandidate[] = waiting.map((application) => ({
    ...application,
    latestInterview: latestInterview.get(application.id) ?? null,
  }));
  const reminders = followUpReminders(candidates, { afterDays }, now);
  if (reminders.length === 0) return 0;

  const jobTitles = new Map(waiting.map((a) => [a.id, a.jobTitle]));
  const inserted = await db
    .insert(notifications)
    .values(
      reminders.map((reminder) => ({
        userId,
        applicationId: reminder.applicationId,
        type: "FOLLOW_UP_DUE" as const,
        title: reminder.title,
        body: jobTitles.get(reminder.applicationId) ?? null,
        dedupeKey: reminder.dedupeKey,
        createdAt: reminder.dueAt,
        readAt:
          readBefore && reminder.dueAt < readBefore ? reminder.dueAt : null,
      })),
    )
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    })
    .returning({ id: notifications.id });
  return inserted.length;
}

/**
 * Looks for due follow-ups if it hasn't in the last hour and reminders are
 * on. Called while rendering the app, until scheduled jobs arrive.
 */
export async function refreshFollowUpReminders(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<void> {
  const [settings] = await db
    .select({
      enabled: userSettings.followUpRemindersEnabled,
      afterDays: userSettings.followUpAfterDays,
      checkedAt: userSettings.remindersCheckedAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  if (
    settings?.checkedAt &&
    now.getTime() - settings.checkedAt.getTime() < REMINDER_CHECK_INTERVAL_MS
  ) {
    return;
  }

  // Claim the check first, so simultaneous page loads don't all run it.
  const claimed = await db
    .insert(userSettings)
    .values({ userId, remindersCheckedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { remindersCheckedAt: now },
      setWhere: sql`${userSettings.remindersCheckedAt} is null or ${userSettings.remindersCheckedAt} < ${new Date(now.getTime() - REMINDER_CHECK_INTERVAL_MS).toISOString()}::timestamptz`,
    })
    .returning({
      enabled: userSettings.followUpRemindersEnabled,
      afterDays: userSettings.followUpAfterDays,
    });
  const [current] = claimed;
  if (!current?.enabled) return;

  await generateFollowUpReminders(
    userId,
    { now, afterDays: current.afterDays },
    db,
  );
}
