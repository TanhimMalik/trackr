import "server-only";
import {
  DEFAULT_FOLLOW_UP_AFTER_DAYS,
  FOLLOW_UP_AFTER_DAY_OPTIONS,
  type AutomationSettings,
} from "@trackr/domain";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { userSettings } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

export type FollowUpSettings = {
  enabled: boolean;
  afterDays: number;
};

const DEFAULTS: FollowUpSettings = {
  enabled: true,
  afterDays: DEFAULT_FOLLOW_UP_AFTER_DAYS,
};

export const followUpSettingsSchema = z.object({
  enabled: z.boolean(),
  afterDays: z
    .number()
    .int()
    .refine(
      (days) =>
        (FOLLOW_UP_AFTER_DAY_OPTIONS as readonly number[]).includes(days),
      "Pick one of the offered intervals.",
    ),
});

/** The user's follow-up preferences, or the defaults if they never changed them. */
export async function getFollowUpSettings(
  userId: string,
  db: Database = getDb(),
): Promise<FollowUpSettings> {
  const [row] = await db
    .select({
      enabled: userSettings.followUpRemindersEnabled,
      afterDays: userSettings.followUpAfterDays,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row ?? DEFAULTS;
}

/**
 * Saves the follow-up preferences. Reminders are checked again on the next
 * visit, so a shorter interval takes effect right away.
 */
export async function updateFollowUpSettings(
  userId: string,
  input: unknown,
  db: Database = getDb(),
): Promise<FollowUpSettings> {
  const { enabled, afterDays } = followUpSettingsSchema.parse(input);
  const values = {
    followUpRemindersEnabled: enabled,
    followUpAfterDays: afterDays,
    remindersCheckedAt: null,
  };
  await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values });
  return { enabled, afterDays };
}

/** Whether the extension records applications on supported job sites by itself. */
export async function getAutoTrackSupportedSites(
  userId: string,
  db: Database = getDb(),
): Promise<boolean> {
  const [row] = await db
    .select({ enabled: userSettings.autoTrackSupportedSites })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row?.enabled ?? true;
}

export async function setAutoTrackSupportedSites(
  userId: string,
  enabled: unknown,
  db: Database = getDb(),
): Promise<boolean> {
  const value = z.boolean().parse(enabled);
  await db
    .insert(userSettings)
    .values({ userId, autoTrackSupportedSites: value })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { autoTrackSupportedSites: value },
    });
  return value;
}

export const emailAutomationSchema = z.object({
  autoUpdateEnabled: z.boolean(),
  askBeforeMediumConfidence: z.boolean(),
});

/** How much Trackr may change on its own from email; on by default. */
export async function getEmailAutomation(
  userId: string,
  db: Database = getDb(),
): Promise<AutomationSettings> {
  const [row] = await db
    .select({
      autoUpdateEnabled: userSettings.emailAutoUpdate,
      askBeforeMediumConfidence: userSettings.emailAskMediumConfidence,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row ?? { autoUpdateEnabled: true, askBeforeMediumConfidence: false };
}

export async function setEmailAutomation(
  userId: string,
  input: unknown,
  db: Database = getDb(),
): Promise<AutomationSettings> {
  const settings = emailAutomationSchema.parse(input);
  const values = {
    emailAutoUpdate: settings.autoUpdateEnabled,
    emailAskMediumConfidence: settings.askBeforeMediumConfidence,
  };
  await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values });
  return settings;
}
