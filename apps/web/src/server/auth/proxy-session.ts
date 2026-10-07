import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session for a request and reports whether it has a
 * valid one. Refreshed cookies (and the no-store headers that must accompany
 * them) are written to both the forwarded request and the returned response.
 */
export async function updateSession(request: NextRequest) {
  const env = publicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Verifies the JWT and refreshes an expired session. Do not add code between
  // creating the client and this call.
  const { data } = await supabase.auth.getClaims();

  return { response, isAuthenticated: Boolean(data?.claims?.sub) };
}

/** A redirect that keeps any session cookies refreshed for this request. */
export function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  const cacheControl = sessionResponse.headers.get("cache-control");
  if (cacheControl) redirect.headers.set("cache-control", cacheControl);
  return redirect;
}
