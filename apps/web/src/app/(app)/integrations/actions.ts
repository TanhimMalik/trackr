"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/services/errors";
import { revokeExtensionSession } from "@/server/services/extension-auth";

export async function disconnectBrowserAction(
  sessionId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await revokeExtensionSession(user.id, sessionId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, error: "This browser is already disconnected." };
    }
    throw error;
  }
  revalidatePath("/integrations");
  return { ok: true, message: "Browser disconnected." };
}
