import { ZodError } from "zod";
import {
  extensionError,
  requireExtensionSession,
} from "@/server/auth/extension";
import { FitUnavailableError } from "@/server/services/fit";
import { triagePostings } from "@/server/services/triage";
import { getAccount } from "@/server/services/users";

// Up to 30 postings, six at a time, a few seconds each.
export const maxDuration = 60;

/** Scores the job postings open in the browser's tabs against the resume profile. */
export async function POST(request: Request) {
  const auth = await requireExtensionSession(request, { limit: 10 });
  if (auth instanceof Response) return auth;

  const account = await getAccount(auth.userId);
  if (!account) return extensionError(401, "invalid_token");
  // Demo workspaces use a sample resume; scoring real postings needs an account.
  if (account.isDemo) return extensionError(403, "demo_account");

  const payload = await request.json().catch(() => null);
  try {
    const result = await triagePostings(auth.userId, payload);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return extensionError(400, "invalid_request");
    }
    if (error instanceof FitUnavailableError) {
      return extensionError(503, "fit_unavailable");
    }
    console.error("triage_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return extensionError(500, "server_error");
  }
}
