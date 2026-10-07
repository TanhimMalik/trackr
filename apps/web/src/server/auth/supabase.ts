import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client bound to the current request's cookies, for server
 * components, server actions and route handlers.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. The proxy refreshes the
            // session on every request, so the refreshed cookies still arrive.
          }
        },
      },
    },
  );
}

/**
 * Signs the current session out and removes its cookies even if Supabase
 * couldn't confirm it, so a session that has already ended on the server can
 * never keep a visitor half signed in. For server actions and route handlers.
 */
export async function endSupabaseSession(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("sign_out_failed", { code: error.code ?? error.name });
  }
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) cookieStore.delete(name);
  }
}
