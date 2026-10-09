import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against a production build, in the Chrome installed on
 * this machine. They use the database in .env.local and start demo
 * workspaces, which each test ends again.
 *
 *   pnpm --filter @trackr/web build && pnpm --filter @trackr/web test:e2e
 */
const PORT = 3002;

export default defineConfig({
  testDir: "e2e",
  // Each test opens its own demo; Supabase rate-limits anonymous sign-ins.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
