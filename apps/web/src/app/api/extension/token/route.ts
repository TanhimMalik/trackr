import { z } from "zod";
import {
  clientAddress,
  extensionError,
  tooManyRequests,
} from "@/server/auth/extension";
import {
  exchangeConnectCode,
  InvalidGrantError,
  refreshExtensionTokens,
  type ExtensionTokens,
} from "@/server/services/extension-auth";
import { consumeRateLimit } from "@/server/services/rate-limit";

const MINUTE_MS = 60 * 1000;

const requestSchema = z.discriminatedUnion("grantType", [
  z.object({
    grantType: z.literal("code"),
    code: z.string().min(1).max(200),
  }),
  z.object({
    grantType: z.literal("refresh"),
    refreshToken: z.string().min(1).max(200),
  }),
]);

const tokenResponse = (tokens: ExtensionTokens) =>
  Response.json(
    {
      accessToken: tokens.accessToken,
      accessExpiresAt: tokens.accessExpiresAt.toISOString(),
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );

/**
 * Exchanges a one-time connect code for tokens, or rotates a refresh token.
 * Tokens travel only in request and response bodies, never in URLs.
 */
export async function POST(request: Request) {
  const rate = await consumeRateLimit(`ext-token:${clientAddress(request)}`, {
    limit: 30,
    windowMs: MINUTE_MS,
  });
  if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return extensionError(400, "invalid_request");

  try {
    const tokens =
      body.data.grantType === "code"
        ? await exchangeConnectCode(body.data.code)
        : await refreshExtensionTokens(body.data.refreshToken);
    return tokenResponse(tokens);
  } catch (error) {
    if (error instanceof InvalidGrantError) {
      return extensionError(400, "invalid_grant");
    }
    console.error("extension_token_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return extensionError(500, "server_error");
  }
}
