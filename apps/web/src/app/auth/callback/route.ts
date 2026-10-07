import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath, SIGN_IN_PATH } from "@/lib/auth/routes";
import { sessionUserFromAuthUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { upsertUser } from "@/server/services/users";

/**
 * Completes email confirmation: exchanges the one-time code from the
 * confirmation link for a session, then continues into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user?.email) {
      await upsertUser(sessionUserFromAuthUser(data.user));
      const next = safeRedirectPath(searchParams.get("next"));
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const failure = new URL(SIGN_IN_PATH, request.url);
  failure.searchParams.set("error", "confirmation");
  return NextResponse.redirect(failure);
}
