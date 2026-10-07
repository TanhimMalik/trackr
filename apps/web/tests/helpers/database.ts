import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/types";

const migrationsFolder = path.resolve(
  import.meta.dirname,
  "../../src/server/db/migrations",
);

export type TestDatabase = {
  db: Database;
  client: PGlite;
  close: () => Promise<void>;
};

/**
 * A fresh in-process Postgres (PGlite) with every migration applied. Tests get
 * real Postgres behavior — constraints, enums, cascades — without Docker.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  return { db, client, close: () => client.close() };
}

/** The Postgres error code (SQLSTATE) a promise rejects with, if any. */
export async function postgresErrorCode(
  promise: PromiseLike<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate.cause?.code ?? candidate.code;
  }
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
