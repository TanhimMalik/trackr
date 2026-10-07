import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "./supabase";

export type SessionUser = {
  id: string;
  /** Null for demo accounts, which are anonymous. */
  email: string | null;
  name: string | null;
  /** A temporary demo workspace rather than a real account. */
  isDemo: boolean;
};

function displayName(metadata: Record<string, unknown> | undefined) {
  const name = metadata?.name;
  return typeof name === "string" && name ? name : null;
}

/** The application's record of a Supabase user, as stored in `users`. */
export function sessionUserFromAuthUser(user: User): SessionUser {
  const isDemo = user.is_anonymous === true;
  if (!user.email && !isDemo) {
    throw new Error("Authenticated user has no email address");
  }
  return {
    id: user.id,
    email: user.email || null,
    name: displayName(user.user_metadata),
    isDemo,
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

  const { sub, email, is_anonymous, user_metadata: metadata } = data.claims;
  const isDemo = is_anonymous === true;
  if (!sub || (!email && !isDemo)) return null;

  return { id: sub, email: email || null, name: displayName(metadata), isDemo };
});

/** The signed-in user; redirects to sign-in when there is none. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}
