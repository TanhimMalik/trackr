/** Lowercases and removes diacritics ("Société" → "societe"). */
export function foldText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function tokenize(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}
