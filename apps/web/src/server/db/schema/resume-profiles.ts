import type { FitPreferences, ResumeProfile } from "@trackr/domain";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";
import { users } from "./users";

/**
 * What the person's resume shows, as read once by the model, and their own
 * preferences. The resume file itself is never stored.
 */
export const resumeProfiles = pgTable("resume_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  profile: jsonb("profile").$type<ResumeProfile>().notNull(),
  preferences: jsonb("preferences").$type<FitPreferences>().notNull(),
  sourceFilename: text("source_filename"),
  model: text("model"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
