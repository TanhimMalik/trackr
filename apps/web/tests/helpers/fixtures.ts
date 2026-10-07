import { users } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

export async function createTestUser(db: Database): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${id}@example.com` });
  return id;
}

export const daysAgo = (days: number, from = new Date()) =>
  new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
