import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";
import { createdAt, updatedAt } from "./columns";
import {
  classificationMethodEnum,
  emailClassificationEnum,
  emailProcessingStatusEnum,
} from "./enums";
import { integrations } from "./integrations";
import { users } from "./users";

/**
 * Job-related messages from Gmail: who sent them, the subject, Gmail's
 * snippet and what Trackr found. Bodies are never stored. Messages judged
 * irrelevant keep identifiers only, so later syncs skip them.
 */
export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    senderEmail: text("sender_email"),
    senderName: text("sender_name"),
    senderDomain: text("sender_domain"),
    subject: text("subject"),
    snippet: text("snippet"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    classification: emailClassificationEnum("classification"),
    classificationConfidence: real("classification_confidence"),
    classificationMethod: classificationMethodEnum("classification_method"),
    // Extracted details and the evidence sentence, never the body.
    extractedJson: jsonb("extracted_json").$type<Record<string, unknown>>(),
    companyName: text("company_name"),
    jobTitle: text("job_title"),
    processingStatus: emailProcessingStatusEnum("processing_status").notNull(),
    applicationId: uuid("application_id"),
    matchScore: integer("match_score"),
    errorCode: text("error_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "emails_application_fk",
      columns: [table.applicationId],
      foreignColumns: [applications.id],
    }).onDelete("set null"),
    unique("emails_user_message_unique").on(table.userId, table.gmailMessageId),
    index("emails_user_status_idx").on(table.userId, table.processingStatus),
    index("emails_user_thread_idx").on(table.userId, table.gmailThreadId),
  ],
).enableRLS();
