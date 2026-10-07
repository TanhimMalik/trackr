import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/server/env";
import * as schema from "./schema";
import type { Database } from "./types";

// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as { trackrDb?: Database };

/**
 * The application's database. Supabase's transaction pooler does not support
 * prepared statements, so they are disabled; the small pool suits serverless.
 */
export function getDb(): Database {
  globalForDb.trackrDb ??= drizzle({
    client: postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 }),
    schema,
  });
  return globalForDb.trackrDb;
}
