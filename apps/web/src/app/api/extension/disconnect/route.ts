import { requireExtensionSession } from "@/server/auth/extension";
import { revokeExtensionSession } from "@/server/services/extension-auth";

/** Disconnects the calling browser, as Disconnect in Integrations does. */
export async function POST(request: Request) {
  const auth = await requireExtensionSession(request);
  if (auth instanceof Response) return auth;

  await revokeExtensionSession(auth.userId, auth.sessionId);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
