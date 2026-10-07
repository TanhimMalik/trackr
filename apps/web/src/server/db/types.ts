import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Any Drizzle Postgres database with Trackr's schema: postgres-js in the app,
 * PGlite in tests. Services accept this type so they run against either.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type User = typeof schema.users.$inferSelect;
export type Application = typeof schema.applications.$inferSelect;
export type NewApplication = typeof schema.applications.$inferInsert;
export type ApplicationEvent = typeof schema.applicationEvents.$inferSelect;
export type NewApplicationEvent = typeof schema.applicationEvents.$inferInsert;
export type ResumeVersion = typeof schema.resumeVersions.$inferSelect;
export type Contact = typeof schema.contacts.$inferSelect;
export type Interview = typeof schema.interviews.$inferSelect;
