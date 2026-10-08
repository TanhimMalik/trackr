import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";
import { createdAt } from "./columns";
import {
  applicationEventTypeEnum,
  applicationStatusEnum,
  classificationMethodEnum,
  eventSourceTypeEnum,
} from "./enums";
import { users } from "./users";

/**
 * Append-only application history. Rows are only updated to record derived
 * transitions (status_before/status_after) and undo (reverted_at).
 */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    eventType: applicationEventTypeEnum("event_type").notNull(),
    // When it happened in the world (email date, submission time).
    eventTimestamp: timestamp("event_timestamp", {
      withTimezone: true,
    }).notNull(),

    sourceType: eventSourceTypeEnum("source_type").notNull(),
    sourceReference: text("source_reference"),
    classificationMethod: classificationMethodEnum("classification_method"),
    confidence: real("confidence"),
    // Validated per event type by the domain package before it is written.
    metadata: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // Makes ingestion idempotent, e.g. "email:<messageId>" or "manual:<uuid>".
    dedupeKey: text("dedupe_key").notNull(),

    statusBefore: applicationStatusEnum("status_before"),
    statusAfter: applicationStatusEnum("status_after"),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),

    // When Trackr recorded it.
    createdAt: createdAt(),
  },
  (table) => [
    // An event must belong to an application owned by the same user.
    foreignKey({
      name: "application_events_application_fk",
      columns: [table.applicationId, table.userId],
      foreignColumns: [applications.id, applications.userId],
    }).onDelete("cascade"),
    unique("application_events_user_dedupe_key_unique").on(
      table.userId,
      table.dedupeKey,
    ),
    index("application_events_application_timestamp_idx").on(
      table.applicationId,
      table.eventTimestamp,
    ),
    // The Activity page: everything for a user, newest first.
    index("application_events_user_timestamp_idx").on(
      table.userId,
      table.eventTimestamp.desc(),
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("application_events_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    check(
      "application_events_confidence_range",
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
  ],
).enableRLS();
