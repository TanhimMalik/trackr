import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { googleOAuthConfig } from "@/server/env";
import {
  authorizationUrl,
  newAuthorizationAttempt,
} from "@/server/integrations/google-oauth";
import {
  gmailRedirectUri,
  integrationsResult,
  OAUTH_COOKIE,
  oauthCookieOptions,
} from "../oauth-cookie";

/** Sends the signed-in user to Google to grant read-only Gmail access. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/integrations");
  // Demo workspaces are anonymous and temporary; Gmail needs a real account.
  if (user.isDemo) redirect(integrationsResult("demo"));
  const config = googleOAuthConfig();
  if (!config) redirect(integrationsResult("unavailable"));

  const { state, verifier } = newAuthorizationAttempt();
  (await cookies()).set(
    OAUTH_COOKIE,
    `${state}.${verifier}`,
    oauthCookieOptions(),
  );
  redirect(
    authorizationUrl(config, {
      redirectUri: gmailRedirectUri(),
      state,
      verifier,
      loginHint: user.email ?? undefined,
    }),
  );
}
