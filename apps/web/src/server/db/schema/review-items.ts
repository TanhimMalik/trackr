import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";
import { createdAt } from "./columns";
import { emails } from "./emails";
import {
  reviewItemKindEnum,
  reviewItemStateEnum,
  reviewResolutionEnum,
} from "./enums";
import { users } from "./users";

/**
 * One queue for everything Trackr isn't sure about, such as a submission that
 * may duplicate an application, or an email Trackr couldn't place.
 */
export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: reviewItemKindEnum("kind").notNull(),
    state: reviewItemStateEnum("state").notNull().default("OPEN"),
    // The application under review.
    applicationId: uuid("application_id"),
    // The suggested match or duplicate.
    candidateApplicationId: uuid("candidate_application_id").references(
      () => applications.id,
      { onDelete: "set null" },
    ),
    emailId: uuid("email_id").references(() => emails.id, {
      onDelete: "cascade",
    }),
    // Validated event input to record if the item is confirmed.
    proposedEvent: jsonb("proposed_event").$type<Record<string, unknown>>(),
    matchScore: integer("match_score"),
    matchReasons: jsonb("match_reasons").$type<string[]>(),
    resolution: reviewResolutionEnum("resolution"),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "review_items_application_fk",
      columns: [table.applicationId, table.userId],
      foreignColumns: [applications.id, applications.userId],
    }).onDelete("cascade"),
    unique("review_items_user_dedupe_unique").on(table.userId, table.dedupeKey),
    index("review_items_user_state_created_idx").on(
      table.userId,
      table.state,
      table.createdAt.desc(),
    ),
  ],
).enableRLS();
