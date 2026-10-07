import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { applicationEvents } from "./application-events";
import { applications } from "./applications";
import { createdAt } from "./columns";
import { notificationTypeEnum } from "./enums";
import { users } from "./users";

/**
 * In-app notifications. Each one is written once, with its wording, and links
 * to the application it is about.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id"),
    eventId: uuid("event_id").references(() => applicationEvents.id, {
      onDelete: "set null",
    }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true }),
    // e.g. "event:<eventId>" or "stale:<applicationId>:<isoWeek>".
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "notifications_application_fk",
      columns: [table.applicationId, table.userId],
      foreignColumns: [applications.id, applications.userId],
    }).onDelete("cascade"),
    // Makes generating notifications idempotent.
    unique("notifications_user_dedupe_unique").on(
      table.userId,
      table.dedupeKey,
    ),
    index("notifications_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("notifications_user_unread_idx")
      .on(table.userId)
      .where(sql`${table.readAt} is null`),
    index("notifications_event_idx")
      .on(table.eventId)
      .where(sql`${table.eventId} is not null`),
  ],
).enableRLS();
