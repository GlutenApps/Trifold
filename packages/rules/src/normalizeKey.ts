/**
 * The one implementation of record keys (CLAUDE.md conventions).
 * Lowercase, strip `[…]` and `(…)` tags such as `[5.5e]` or `(Legacy)`, fold accents,
 * strip punctuation, collapse whitespace.
 */
export function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
