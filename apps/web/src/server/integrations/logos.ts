import "server-only";

// A bare registrable domain such as "stripe.com" or "bbc.co.uk".
const LOGO_DOMAIN =
  /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// Raster formats only. SVG can carry scripts, so it is never proxied.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const MAX_BYTES = 200_000;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

export function isLogoDomain(domain: string): boolean {
  return LOGO_DOMAIN.test(domain);
}

export type Logo = { body: ArrayBuffer; contentType: string };

/**
 * Fetches a company's icon by domain. Requests come from the server, so the
 * provider never sees which companies a person has applied to. Returns null
 * when there is no usable logo.
 */
export async function fetchCompanyLogo(
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Logo | null> {
  if (!isLogoDomain(domain)) return null;

  try {
    const response = await fetchImpl(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      {
        signal: AbortSignal.timeout(5000),
        next: { revalidate: WEEK_SECONDS },
      },
    );
    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return null;

    const body = await response.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null;
    return { body, contentType };
  } catch {
    // Network errors and timeouts fall back to initials.
    return null;
  }
}
