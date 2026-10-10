import {
  cleanEmailBody,
  htmlToText,
  type EmailContent,
  type EmailMetadata,
} from "@trackr/domain";

/** The parts of Gmail's message resource Trackr reads. */
export type GmailPart = {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

const header = (message: GmailMessage, name: string): string | null =>
  message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )?.value ?? null;

/** "Datadog Hiring Team <no-reply@greenhouse.io>" → name and address. */
export function parseAddress(value: string | null): {
  name: string | null;
  email: string;
} {
  if (!value) return { name: null, email: "" };
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      name: match[1]!.trim() || null,
      email: match[2]!.trim().toLowerCase(),
    };
  }
  return { name: null, email: value.trim().toLowerCase() };
}

// Gmail's snippet is HTML-escaped.
const unescapeSnippet = (snippet: string) =>
  snippet
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export function receivedAt(message: GmailMessage): Date {
  const ms = Number(message.internalDate);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date();
}

/** What the relevance filter sees: headers, snippet and labels only. */
export function toEmailMetadata(
  message: GmailMessage,
  known: { knownContact?: boolean; knownThread?: boolean } = {},
): EmailMetadata {
  const from = parseAddress(header(message, "From"));
  return {
    fromName: from.name,
    fromEmail: from.email,
    subject: header(message, "Subject") ?? "",
    snippet: unescapeSnippet(message.snippet ?? ""),
    labels: message.labelIds ?? [],
    hasListUnsubscribe: header(message, "List-Unsubscribe") !== null,
    ...known,
  };
}

const decode = (data: string | undefined) =>
  data ? Buffer.from(data, "base64url").toString("utf8") : "";

function* walk(part: GmailPart | undefined): Generator<GmailPart> {
  if (!part) return;
  yield part;
  for (const child of part.parts ?? []) yield* walk(child);
}

/**
 * The start of a calendar invitation, when it is given in UTC
 * ("DTSTART:20261015T180000Z"). Times in a named zone are left for the person
 * to confirm rather than guessed.
 */
export function calendarStart(ics: string): string | null {
  const match = ics.match(/^DTSTART(?:;VALUE=DATE-TIME)?:(\d{8}T\d{6}Z)\s*$/m);
  if (!match) return null;
  const [, date] = match;
  const iso = `${date!.slice(0, 4)}-${date!.slice(4, 6)}-${date!.slice(6, 8)}T${date!.slice(9, 11)}:${date!.slice(11, 13)}:${date!.slice(13, 15)}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

/** The full message as the classifier needs it. The body stays in memory. */
export function toEmailContent(
  message: GmailMessage,
  metadata: EmailMetadata,
): EmailContent {
  let plain = "";
  let html = "";
  let calendar: string | null = null;
  for (const part of walk(message.payload)) {
    const type = part.mimeType?.toLowerCase() ?? "";
    if (type === "text/plain" && !plain) plain = decode(part.body?.data);
    else if (type === "text/html" && !html) html = decode(part.body?.data);
    else if (type === "text/calendar" && !calendar)
      calendar = calendarStart(decode(part.body?.data));
  }
  const fromHtml = html ? htmlToText(html) : { text: "", links: [] };
  const links = [
    ...fromHtml.links,
    ...[...plain.matchAll(/https?:\/\/[^\s<>"')]+/g)].map((match) => match[0]),
  ];
  return {
    ...metadata,
    body: cleanEmailBody(plain || fromHtml.text),
    links: [...new Set(links)],
    calendarStart: calendar,
  };
}
