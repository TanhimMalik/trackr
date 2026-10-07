import { foreignKey, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { applications } from "./applications";
import { createdAt, updatedAt } from "./columns";
import { contactTypeEnum } from "./enums";
import { users } from "./users";

/** People at the company for one application: recruiters, interviewers and so on. */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Stored lowercased.
    email: text("email"),
    title: text("title"),
    contactType: contactTypeEnum("contact_type").notNull().default("OTHER"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "contacts_application_fk",
      columns: [table.applicationId, table.userId],
      foreignColumns: [applications.id, applications.userId],
    }).onDelete("cascade"),
    // Also serves lookups by application.
    unique("contacts_application_email_unique").on(
      table.applicationId,
      table.email,
    ),
  ],
).enableRLS();
