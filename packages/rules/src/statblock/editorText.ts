/**
 * Text ↔ value helpers for the homebrew editor's modifier fields (DESIGN.md §6.2), such as
 * "dex +5, con 3". Comma lists use parseCommaList from fields.ts. Lenient both ways: blanks and
 * unparseable parts are dropped rather than rejected, so a half-typed field never errors.
 */

import { parseCommaList } from './fields';

/** "Dex +5, con 3, bogus" → { dex: 5, con: 3 }. Keys are lower-cased; parts without a number are skipped. */
export function parseModifierPairs(value: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of parseCommaList(value)) {
    const m = /^([A-Za-z ]+?)\s*([+-]?\d+)$/.exec(part);
    if (m) out[m[1]!.trim().toLowerCase()] = Number(m[2]);
  }
  return out;
}

/** The inverse of parseModifierPairs, always with a sign: { dex: 5, con: -1 } → "dex +5, con -1". */
export function formatModifierPairs(value: Record<string, number>): string {
  return Object.entries(value)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`)
    .join(', ');
}
