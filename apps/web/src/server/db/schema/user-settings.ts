import { DEFAULT_FOLLOW_UP_AFTER_DAYS } from "@trackr/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { updatedAt } from "./columns";
import { users } from "./users";

/**
 * Preferences, one row per user, created the first time one is saved or
 * needed. Automation thresholds join later, with the email pipeline.
 */
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    followUpRemindersEnabled: boolean("follow_up_reminders_enabled")
      .notNull()
      .default(true),
    followUpAfterDays: integer("follow_up_after_days")
      .notNull()
      .default(DEFAULT_FOLLOW_UP_AFTER_DAYS),
    // Reminders are generated on visits, at most this often; see notifications.
    remindersCheckedAt: timestamp("reminders_checked_at", {
      withTimezone: true,
    }),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "user_settings_follow_up_days_range",
      sql`${table.followUpAfterDays} between 1 and 90`,
    ),
  ],
).enableRLS();
