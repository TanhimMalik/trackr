/** The longest body passed on for classification. */
export const BODY_BUDGET = 4000;

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
};

/** HTML email as plain text, plus the links it contains. */
export function htmlToText(html: string): { text: string; links: string[] } {
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1]!.replace(/&amp;/g, "&"))
    .filter((href) => /^https?:\/\//i.test(href));
  const text = html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h\d|\/blockquote)\s*\/?>/gi, "\n")
    .replace(/<blockquote[^>]*>/gi, "\n> ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (entity, name: string) => ENTITIES[name] ?? entity);
  return { text, links };
}

// Where a reply's quoted history or a signature begins.
const CUT_MARKERS = [
  /^On .{4,120} wrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^From: .+\n(Sent|Date): /m,
  /^-- ?$/m,
];

/**
 * The part of a message its sender wrote: quoted replies and signatures are
 * dropped, whitespace is tidied, and the result is cut to a fixed budget.
 */
export function cleanEmailBody(text: string): string {
  let body = text.replace(/\r\n?/g, "\n");
  for (const marker of CUT_MARKERS) {
    const match = marker.exec(body);
    if (match) body = body.slice(0, match.index);
  }
  return body
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, BODY_BUDGET);
}
