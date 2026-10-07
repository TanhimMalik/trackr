import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "./supabase";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

function displayName(metadata: Record<string, unknown> | undefined) {
  const name = metadata?.name;
  return typeof name === "string" && name ? name : null;
}

/** The application's record of a Supabase user, as stored in `users`. */
export function sessionUserFromAuthUser(user: User): SessionUser {
  if (!user.email) throw new Error("Authenticated user has no email address");
  return {
    id: user.id,
    email: user.email,
    name: displayName(user.user_metadata),
  };
}

/**
 * The signed-in user, verified from the session's JWT, or null. Cached for the
 * duration of a request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const { sub, email, user_metadata: metadata } = data.claims;
  if (!sub || !email) return null;

  return { id: sub, email, name: displayName(metadata) };
});

/** The signed-in user; redirects to sign-in when there is none. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}
