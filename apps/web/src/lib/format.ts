/** Up to two initials for an avatar: "Tanhim Malik" → "TM", "jane@x.com" → "J". */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@")
    ? nameOrEmail.slice(0, nameOrEmail.indexOf("@"))
    : nameOrEmail;
  const words = base.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1 || nameOrEmail.includes("@")
      ? [words[0]![0]]
      : [words[0]![0], words.at(-1)![0]];
  return letters.join("").toUpperCase();
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function yearIn(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(
    date,
  );
}

/** "Thu, Oct 9 · 2:00 PM", with the year when it isn't the current one. */
export function formatDateTime(
  date: Date,
  { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {},
): string {
  const sameYear = yearIn(date, timeZone) === yearIn(now, timeZone);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `${day} · ${time}`;
}

/** "Apr 22" within the current year, "Apr 22, 2025" otherwise. */
export function formatShortDate(
  date: Date,
  { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {},
): string {
  const sameYear = yearIn(date, timeZone) === yearIn(now, timeZone);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(date);
}

/** "just now", "14 min ago", "3 hours ago", "yesterday", "4 days ago", then a date. */
export function formatRelativeTime(
  date: Date,
  { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {},
): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < -MINUTE) return formatShortDate(date, { now, timeZone });
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatShortDate(date, { now, timeZone });
}

function compactMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    // Unknown currency codes fall back to a plain number.
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

/** "$150K – $185K", "From $150K", "Up to $185K", or null when unknown. */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  const code = currency ?? "USD";
  if (min !== null && max !== null) {
    return min === max
      ? compactMoney(min, code)
      : `${compactMoney(min, code)} – ${compactMoney(max, code)}`;
  }
  if (min !== null) return `From ${compactMoney(min, code)}`;
  if (max !== null) return `Up to ${compactMoney(max, code)}`;
  return null;
}
