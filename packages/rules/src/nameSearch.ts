import { normalizeKey } from './normalizeKey';

/**
 * Name matching for the global search (ADR 0017): case-insensitive, punctuation folded the
 * same way record keys are, ranked exact, then prefix, then the start of a later word, then
 * anywhere in the name. The in-memory campaign data (notes, NPCs, encounters, scenes) ranks
 * through `rankByName`; the compendium ranks the same tiers in SQL (`buildSuggest`) so both
 * halves of a result list agree on what comes first.
 */
export type MatchTier = 'exact' | 'prefix' | 'word' | 'substring';

/** Lower is better; the order a result list shows. */
export const TIER_RANK: Record<MatchTier, number> = { exact: 0, prefix: 1, word: 2, substring: 3 };

export interface NameMatch<T> {
  item: T;
  tier: MatchTier;
  /** The name that matched, as written. */
  name: string;
}

/**
 * The folded form a query and a name are compared in: a record key, with apostrophes dropped
 * first so "hespers" finds "Hesper's letter".
 */
export function foldName(text: string): string {
  return normalizeKey(text.replace(/['’]/g, ''));
}

/**
 * How `name` matches an already folded `query`, or null. The name is folded here; callers
 * ranking many names fold the query once.
 */
export function matchName(foldedQuery: string, name: string): MatchTier | null {
  if (!foldedQuery) return null;
  const folded = foldName(name);
  if (!folded) return null;
  if (folded === foldedQuery) return 'exact';
  if (folded.startsWith(foldedQuery)) return 'prefix';
  const at = folded.indexOf(foldedQuery);
  if (at < 0) return null;
  return folded[at - 1] === ' ' ? 'word' : 'substring';
}

/**
 * Ranks `items` by how their names match `query`: best tier first, then by name. An item may
 * offer several names (a scene's title and subtitle, an encounter's member names); its best
 * one counts. Items with no match are left out; an empty query matches nothing.
 */
export function rankByName<T>(
  query: string,
  items: readonly T[],
  namesOf: (item: T) => string | readonly string[],
  limit = Infinity,
): NameMatch<T>[] {
  const folded = foldName(query);
  if (!folded) return [];
  const matches: NameMatch<T>[] = [];
  for (const item of items) {
    const names = namesOf(item);
    let best: NameMatch<T> | null = null;
    for (const name of typeof names === 'string' ? [names] : names) {
      const tier = matchName(folded, name);
      if (tier && (!best || TIER_RANK[tier] < TIER_RANK[best.tier])) best = { item, tier, name };
    }
    if (best) matches.push(best);
  }
  matches.sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
  return matches.length > limit ? matches.slice(0, limit) : matches;
}
