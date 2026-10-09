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

export type GoogleOAuthConfig = { clientId: string; clientSecret: string };

/**
 * The Google OAuth client for Gmail, or null when this deployment doesn't
 * have one. Gmail is optional: without it, the rest of Trackr still works.
 */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const encryptionKeySchema = z
  .string()
  .transform((value) => Buffer.from(value, "base64"))
  .refine((key) => key.length === 32, "must be 32 bytes, base64-encoded");

/**
 * The key that encrypts stored OAuth tokens (32 random bytes, base64). Its
 * version is part of every ciphertext, so it can be rotated later.
 */
export function tokenEncryptionKey(): Buffer {
  const result = encryptionKeySchema.safeParse(
    process.env.TOKEN_ENCRYPTION_KEY ?? "",
  );
  if (!result.success) {
    throw new Error(
      "Missing or invalid environment variables: TOKEN_ENCRYPTION_KEY. See apps/web/.env.example.",
    );
  }
  return result.data;
}

export type EmailLlmConfig = { apiKey: string; model: string };

/**
 * The model that reads emails the rules can't settle, or null when this
 * deployment has no key. Optional: without it, Gmail sync runs on rules alone.
 */
export function emailLlmConfig(): EmailLlmConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.EMAIL_LLM_MODEL?.trim() || "claude-haiku-5-5",
  };
}
