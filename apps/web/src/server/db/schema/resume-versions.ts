import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { users } from "./users";

export const resumeVersions = pgTable(
  "resume_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Path in a private storage bucket, served through signed URLs.
    storagePath: text("storage_path"),
    originalFilename: text("original_filename"),
    createdAt: createdAt(),
  },
  (table) => [index("resume_versions_user_idx").on(table.userId)],
).enableRLS();
