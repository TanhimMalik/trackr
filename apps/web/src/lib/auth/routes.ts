export const DEFAULT_AUTHENTICATED_PATH = "/overview";
export const SIGN_IN_PATH = "/login";

export const DEMO_PATH = "/demo";

// The landing page, the demo starter, and sign-in and sign-up.
const ENTRY_PAGES = new Set(["/", DEMO_PATH, "/login", "/signup"]);

export type RouteAccess =
  /** Ways in for signed-out visitors: signed-in users are sent to the app. */
  | "entry"
  /** Reachable without a session (auth callbacks; API routes authenticate themselves). */
  | "public"
  /** Requires a signed-in user. */
  | "protected";

// Files crawlers and link previews fetch without a session.
const PUBLIC_FILES = new Set([
  "/robots.txt",
  "/opengraph-image",
  "/icon.svg",
  "/favicon.ico",
]);

export function routeAccess(pathname: string): RouteAccess {
  if (ENTRY_PAGES.has(pathname)) return "entry";
  if (PUBLIC_FILES.has(pathname)) return "public";
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) {
    return "public";
  }
  return "protected";
}

/**
 * Returns a same-origin path to continue to after signing in, or the default.
 * Rejects absolute and protocol-relative URLs so `?next=` cannot be used as an
 * open redirect, and entry pages so it cannot cause a redirect loop.
 */
export function safeRedirectPath(next: unknown): string {
  if (typeof next !== "string") return DEFAULT_AUTHENTICATED_PATH;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  const url = new URL(next, "http://trackr.invalid");
  if (url.origin !== "http://trackr.invalid") return DEFAULT_AUTHENTICATED_PATH;
  if (routeAccess(url.pathname) !== "protected") {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  return `${url.pathname}${url.search}`;
}
