import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __TRACKR_URL__: JSON.stringify("http://localhost:3000") },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
