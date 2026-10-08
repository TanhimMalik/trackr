import "server-only";
import {
  authenticateExtensionToken,
  type ExtensionAuth,
} from "@/server/services/extension-auth";
import { consumeRateLimit } from "@/server/services/rate-limit";

const MINUTE_MS = 60 * 1000;

/** JSON errors for the extension API, in the shape OAuth clients expect. */
export function extensionError(
  status: number,
  error: string,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

export const tooManyRequests = (retryAfterSeconds: number) =>
  extensionError(429, "rate_limited", {
    "Retry-After": String(retryAfterSeconds),
  });

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/**
 * Authenticates an extension API request by its bearer token and applies the
 * per-browser rate limit. Returns the session, or the response to send instead.
 */
export async function requireExtensionSession(
  request: Request,
  {
    limit = 60,
    windowMs = MINUTE_MS,
  }: { limit?: number; windowMs?: number } = {},
): Promise<ExtensionAuth | Response> {
  const token = bearerToken(request);
  const auth = token ? await authenticateExtensionToken(token) : null;
  if (!auth) {
    return extensionError(401, "invalid_token", {
      "WWW-Authenticate": 'Bearer error="invalid_token"',
    });
  }

  const rate = await consumeRateLimit(`ext:${auth.sessionId}`, {
    limit,
    windowMs,
  });
  if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
  return auth;
}

/** The caller's address, for limiting requests that come before any token. */
export function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
