import { publicEnv } from "@/lib/env";

/** Holds `state` and the PKCE verifier between leaving for Google and coming back. */
export const OAUTH_COOKIE = "trackr_gmail_oauth";

export const oauthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: publicEnv().NEXT_PUBLIC_APP_URL.startsWith("https:"),
  path: "/api/integrations/gmail",
  maxAge: 10 * 60,
});

export const gmailRedirectUri = () =>
  `${publicEnv().NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`;

/** Where Integrations shows the outcome. */
export const integrationsResult = (result: string) =>
  `/integrations?gmail=${result}`;
