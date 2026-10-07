import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | undefined;

/**
 * Public configuration, safe to expose to the browser. Variables are referenced
 * by name so Next.js can inline them into client bundles.
 */
export function publicEnv(): PublicEnv {
  if (!cached) {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    if (!result.success) {
      const names = [...new Set(result.error.issues.map((i) => i.path[0]))];
      throw new Error(
        `Missing or invalid environment variables: ${names.join(", ")}. See apps/web/.env.example.`,
      );
    }
    cached = result.data;
  }
  return cached;
}
