import type { NextRequest } from "next/server";
import {
  DEFAULT_AUTHENTICATED_PATH,
  routeAccess,
  SIGN_IN_PATH,
} from "@/lib/auth/routes";
import {
  redirectWithSession,
  updateSession,
} from "@/server/auth/proxy-session";

/**
 * Refreshes the session on every page request and redirects optimistically.
 * Pages and services still verify the user themselves; this is not the
 * authorization boundary.
 */
export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  const access = routeAccess(pathname);

  if (!isAuthenticated && access === "protected") {
    const url = new URL(SIGN_IN_PATH, request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithSession(url, response);
  }

  if (isAuthenticated && access === "entry") {
    return redirectWithSession(
      new URL(DEFAULT_AUTHENTICATED_PATH, request.url),
      response,
    );
  }

  return response;
}

export const config = {
  // Skip static assets and image optimization.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
