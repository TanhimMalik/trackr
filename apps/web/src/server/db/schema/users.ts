import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

/**
 * One row per account. The id equals the Supabase auth user id; there is no
 * foreign key into the auth schema so the schema stays portable.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    // Demo accounts are anonymous and have no email address.
    email: text("email"),
    name: text("name"),
    // A temporary workspace started from "Try the demo"; deleted when it expires.
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("users_demo_created_idx")
      .on(table.createdAt)
      .where(sql`${table.isDemo}`),
  ],
).enableRLS();
