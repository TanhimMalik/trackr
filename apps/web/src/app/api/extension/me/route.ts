import {
  extensionError,
  requireExtensionSession,
} from "@/server/auth/extension";
import { getAccount } from "@/server/services/users";

/** Confirms the connection and tells the extension who it is connected as. */
export async function GET(request: Request) {
  const auth = await requireExtensionSession(request);
  if (auth instanceof Response) return auth;

  const account = await getAccount(auth.userId);
  if (!account) return extensionError(401, "invalid_token");

  return Response.json(
    {
      email: account.email,
      name: account.name,
      isDemo: account.isDemo,
      settings: { autoTrackSupportedSites: true },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
