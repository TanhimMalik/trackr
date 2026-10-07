import "server-only";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

// Services take the database as their last argument, defaulting to the app's
// connection, so tests can pass an isolated PGlite database instead.

/**
 * Creates or refreshes the application's record of an authenticated user.
 * Called whenever a session is established. An empty name never overwrites a
 * stored one.
 */
export async function upsertUser(
  user: { id: string; email: string; name: string | null },
  db: Database = getDb(),
): Promise<void> {
  await db
    .insert(users)
    .values(user)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: user.email,
        ...(user.name ? { name: user.name } : {}),
        updatedAt: new Date(),
      },
    });
}
