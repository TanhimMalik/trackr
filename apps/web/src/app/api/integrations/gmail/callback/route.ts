import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { googleOAuthConfig } from "@/server/env";
import {
  exchangeAuthorizationCode,
  revokeToken,
} from "@/server/integrations/google-oauth";
import {
  MissingGmailScopeError,
  saveGmailConnection,
} from "@/server/services/gmail-connection";
import {
  gmailRedirectUri,
  integrationsResult,
  OAUTH_COOKIE,
} from "../oauth-cookie";

const sameState = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google sends the user back here with a one-time code, or an error. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const [expectedState, verifier] = (jar.get(OAUTH_COOKIE)?.value ?? "").split(
    ".",
  );
  jar.delete({ name: OAUTH_COOKIE, path: "/api/integrations/gmail" });

  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/integrations");
  const config = googleOAuthConfig();
  if (!config || user.isDemo) redirect(integrationsResult("unavailable"));

  // Declining on Google's screen comes back as ?error=access_denied.
  if (params.get("error")) redirect(integrationsResult("denied"));
  const state = params.get("state") ?? "";
  const code = params.get("code");
  if (
    !code ||
    !expectedState ||
    !verifier ||
    !sameState(state, expectedState)
  ) {
    redirect(integrationsResult("expired"));
  }

  let result = "connected";
  try {
    const tokens = await exchangeAuthorizationCode(config, {
      code,
      verifier,
      redirectUri: gmailRedirectUri(),
    });
    try {
      await saveGmailConnection(user.id, tokens);
    } catch (error) {
      if (!(error instanceof MissingGmailScopeError)) throw error;
      // Without Gmail access the grant is useless; give it back.
      await revokeToken(tokens.refreshToken ?? tokens.accessToken);
      result = "missing_scope";
    }
  } catch (error) {
    console.error("gmail_connect_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    result = "error";
  }
  redirect(integrationsResult(result));
}
