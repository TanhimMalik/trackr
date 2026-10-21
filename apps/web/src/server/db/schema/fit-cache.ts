import { jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import type { StoredFit } from "@/server/fit/types";
import { createdAt } from "./columns";
import { users } from "./users";

/**
 * Scores already worked out for a posting, so triaging the same tabs again
 * or saving a scored job never asks the model twice. A row counts only while
 * it is newer than the person's resume profile.
 */
export const fitCache = pgTable(
  "fit_cache",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the rubric version and the posting as the model saw it.
    postingHash: text("posting_hash").notNull(),
    fit: jsonb("fit").$type<StoredFit>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.postingHash] })],
).enableRLS();
