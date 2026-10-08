import { ZodError } from "zod";
import {
  extensionError,
  requireExtensionSession,
} from "@/server/auth/extension";
import { ingestExtensionSubmission } from "@/server/services/extension-ingestion";

/** Reports an application the extension saw submitted, or one tracked from its popup. */
export async function POST(request: Request) {
  const auth = await requireExtensionSession(request, { limit: 30 });
  if (auth instanceof Response) return auth;

  const payload = await request.json().catch(() => null);
  try {
    const result = await ingestExtensionSubmission(auth.userId, payload);
    return Response.json(result, {
      status: result.outcome === "MATCHED_EXISTING" ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return extensionError(400, "invalid_request");
    }
    console.error("extension_submission_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return extensionError(500, "server_error");
  }
}
