import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { applicationEvents } from "./application-events";
import { applications } from "./applications";
import { createdAt, updatedAt } from "./columns";
import { contacts } from "./contacts";
import { interviewStatusEnum, interviewTypeEnum } from "./enums";
import { users } from "./users";

/**
 * Interviews for an application. Created by hand or from an "interview
 * scheduled" event, which they then point back to.
 */
export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    interviewType: interviewTypeEnum("interview_type")
      .notNull()
      .default("OTHER"),
    // Null until a time is agreed.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    meetingUrl: text("meeting_url"),
    location: text("location"),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    status: interviewStatusEnum("status").notNull().default("SCHEDULED"),
    sourceEventId: uuid("source_event_id").references(
      () => applicationEvents.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "interviews_application_fk",
      columns: [table.applicationId, table.userId],
      foreignColumns: [applications.id, applications.userId],
    }).onDelete("cascade"),
    index("interviews_application_scheduled_idx").on(
      table.applicationId,
      table.scheduledAt,
    ),
    index("interviews_user_scheduled_idx").on(table.userId, table.scheduledAt),
    // An event creates at most one interview.
    uniqueIndex("interviews_source_event_unique")
      .on(table.sourceEventId)
      .where(sql`${table.sourceEventId} is not null`),
    check(
      "interviews_duration_range",
      sql`${table.durationMinutes} is null or ${table.durationMinutes} between 1 and 1440`,
    ),
  ],
).enableRLS();
