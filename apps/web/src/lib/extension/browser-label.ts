/** Chrome extension ids are 32 letters from a to p. */
export const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Brave/, "Brave"],
  [/Chrome\//, "Chrome"],
];

const SYSTEMS: [RegExp, string][] = [
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Android/, "Android"],
  [/Linux/, "Linux"],
];

const find = (table: [RegExp, string][], userAgent: string) =>
  table.find(([pattern]) => pattern.test(userAgent))?.[1];

/** A name for a connected browser, such as "Chrome on macOS". */
export function browserLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = find(BROWSERS, ua) ?? "Browser";
  const system = find(SYSTEMS, ua);
  return system ? `${browser} on ${system}` : browser;
}
