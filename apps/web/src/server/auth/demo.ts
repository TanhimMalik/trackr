"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { DEFAULT_AUTHENTICATED_PATH } from "@/lib/auth/routes";
import {
  deleteDemoWorkspace,
  deleteExpiredDemoWorkspaces,
  resetDemoWorkspace,
  seedDemoWorkspace,
} from "@/server/services/demo-workspace";
import { upsertUser } from "@/server/services/users";
import { requireUser, sessionUserFromAuthUser } from "./session";
import { createSupabaseServerClient } from "./supabase";

export type StartDemoState = { error: string } | null;

function startErrorMessage(code: string | undefined): string {
  switch (code) {
    case "over_request_rate_limit":
    case "over_anonymous_sign_in_rate_limit":
      return "Too many demos were started from your network. Try again in a little while.";
    case "anonymous_provider_disabled":
      return "The demo isn't available right now.";
    default:
      return "Couldn't start the demo. Try again.";
  }
}

/**
 * Starts a private demo: an anonymous session with its own copy of the
 * sample workspace. No email, password or sign-up involved.
 */
export async function startDemo(): Promise<StartDemoState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    console.error("demo_start_failed", { code: error?.code ?? "no_user" });
    return { error: startErrorMessage(error?.code) };
  }

  const user = sessionUserFromAuthUser(data.user);
  try {
    await upsertUser(user);
    await seedDemoWorkspace(user.id);
  } catch (seedError) {
    console.error("demo_seed_failed", {
      error: seedError instanceof Error ? seedError.name : "unknown",
    });
    await supabase.auth.signOut();
    await deleteDemoWorkspace(user.id).catch(() => {});
    return { error: startErrorMessage(undefined) };
  }

  // Clear out expired demos once the visitor is on their way.
  after(() =>
    deleteExpiredDemoWorkspaces().catch((cleanupError: unknown) =>
      console.error("demo_cleanup_failed", {
        error: cleanupError instanceof Error ? cleanupError.name : "unknown",
        code: (cleanupError as { cause?: { code?: string } }).cause?.code,
      }),
    ),
  );

  redirect(DEFAULT_AUTHENTICATED_PATH);
}

async function requireDemoUser() {
  const user = await requireUser();
  if (!user.isDemo) throw new Error("Only demo workspaces can do this");
  return user;
}

/** Puts the visitor's demo workspace back to the original sample data. */
export async function resetDemo(): Promise<{ ok: boolean }> {
  const user = await requireDemoUser();
  try {
    await resetDemoWorkspace(user.id);
  } catch (error) {
    console.error("demo_reset_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Ends the demo: signs out and deletes the workspace straight away. */
export async function exitDemo(): Promise<void> {
  const user = await requireDemoUser();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await deleteDemoWorkspace(user.id);
  redirect("/");
}
