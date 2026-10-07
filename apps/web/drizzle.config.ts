import { defineConfig } from "drizzle-kit";

// Drizzle Kit does not load Next.js env files itself.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file: rely on the process environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
