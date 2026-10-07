import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Server-side environment, validated on first use rather than at import time
 * so that builds and tests that never touch these values do not need them.
 */
export function serverEnv(): ServerEnv {
  if (!cached) {
    const result = serverEnvSchema.safeParse(process.env);
    if (!result.success) {
      // Report variable names only; values may be secrets.
      const names = [...new Set(result.error.issues.map((i) => i.path[0]))];
      throw new Error(
        `Missing or invalid environment variables: ${names.join(", ")}. See apps/web/.env.example.`,
      );
    }
    cached = result.data;
  }
  return cached;
}
