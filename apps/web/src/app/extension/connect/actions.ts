"use server";

import { headers } from "next/headers";
import { browserLabel } from "@/lib/extension/browser-label";
import { requireUser } from "@/server/auth/session";
import { createConnectCode } from "@/server/services/extension-auth";

/**
 * Approves connecting this browser's extension and returns the one-time code
 * the page passes to it. The code is useless after a minute or one exchange.
 */
export async function authorizeExtensionAction(): Promise<{ code: string }> {
  const user = await requireUser();
  const label = browserLabel((await headers()).get("user-agent"));
  const { code } = await createConnectCode(user.id, label);
  return { code };
}
