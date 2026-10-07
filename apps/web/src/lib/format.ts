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
