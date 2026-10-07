// Query parameters that only track where a click came from.
const TRACKING_PARAMS = new Set([
  "gh_src",
  "source",
  "src",
  "ref",
  "referrer",
  "refid",
  "trk",
  "trackingid",
  "fbclid",
  "gclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
]);

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    TRACKING_PARAMS.has(lower) ||
    lower.startsWith("utm_") ||
    lower.startsWith("lever-")
  );
}

/**
 * Canonical form of a job URL: https, lowercase host without "www.", no
 * fragment, no tracking parameters, sorted remaining parameters and no
 * trailing slash. Meaningful parameters such as Greenhouse's gh_jid are kept.
 * Returns null for anything that is not an http(s) URL.
 */
export function normalizeJobUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.host.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = new URLSearchParams(params).toString();

  return `https://${host}${path}${query ? `?${query}` : ""}`;
}

// Public suffixes made of two labels, so "jobs.bbc.co.uk" resolves to "bbc.co.uk".
// A small list covering common cases; not a full public-suffix database.
const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.in",
  "co.jp",
  "co.kr",
  "co.za",
  "com.br",
  "com.mx",
  "com.sg",
  "com.cn",
  "com.tr",
]);

/** "careers.stripe.com" → "stripe.com". Null for hosts without a domain (localhost, IPs). */
export function registrableDomain(hostname: string): string | null {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) {
    return null;
  }

  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

export function domainFromUrl(input: string): string | null {
  try {
    return registrableDomain(new URL(input.trim()).hostname);
  } catch {
    return null;
  }
}

export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return registrableDomain(email.slice(at + 1));
}

/**
 * The domain of a company website as people type it: "stripe.com",
 * "www.stripe.com" or "https://stripe.com/about" all give "stripe.com".
 */
export function domainFromWebsite(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return registrableDomain(url.hostname);
  } catch {
    return null;
  }
}
