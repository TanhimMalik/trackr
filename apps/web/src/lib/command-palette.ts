import {
  APPLICATION_STATUS_LABELS,
  foldText,
  type ApplicationStatus,
} from "@trackr/domain";

type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/** ⌘K on a Mac, Ctrl+K elsewhere. Either modifier works everywhere. */
export function isPaletteShortcut(event: ShortcutEvent): boolean {
  return (
    event.key.toLowerCase() === "k" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

const APPLICATION_PREFIX = "application:";

/** A unique palette value for an application; its text lives in keywords. */
export const applicationValue = (id: string) => `${APPLICATION_PREFIX}${id}`;

/** What an application can be found by: company, role, location and status. */
export function applicationKeywords(application: {
  companyName: string;
  jobTitle: string;
  location: string | null;
  currentStatus: ApplicationStatus;
}): string[] {
  return [
    application.companyName,
    application.jobTitle,
    application.location,
    APPLICATION_STATUS_LABELS[application.currentStatus],
  ].filter((keyword): keyword is string => Boolean(keyword));
}

const words = (text: string) =>
  foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// A typed word matches the start of a word ("eng" → "Engineer"), or, from
// three letters, any part of one ("dog" → "Datadog").
const matchesWord = (typed: string, candidates: string[]) =>
  candidates.some(
    (word) =>
      word.startsWith(typed) || (typed.length >= 3 && word.includes(typed)),
  );

/**
 * How well `search` matches an item, from 0 (hidden) to 1. Every typed word
 * has to match; matches in the first field (the company, or the item's
 * name) rank above matches elsewhere.
 */
export function matchScore(search: string, fields: readonly string[]): number {
  const typed = words(search);
  if (typed.length === 0) return 1;
  const [primary = "", ...rest] = fields;

  if (foldText(primary).startsWith(typed.join(" "))) return 1;
  const primaryWords = words(primary);
  if (typed.every((word) => matchesWord(word, primaryWords))) return 0.9;
  const allWords = [...primaryWords, ...rest.flatMap(words)];
  return typed.every((word) => matchesWord(word, allWords)) ? 0.6 : 0;
}

/**
 * The palette's filter. Applications match on their keywords only, so typing
 * never matches characters of an id; other items on their name and keywords.
 */
export function paletteFilter(
  value: string,
  search: string,
  keywords: string[] = [],
): number {
  return value.startsWith(APPLICATION_PREFIX)
    ? matchScore(search, keywords)
    : matchScore(search, [value, ...keywords]);
}
