import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

/**
 * One row per account. The id equals the Supabase auth user id; there is no
 * foreign key into the auth schema so the schema stays portable.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
