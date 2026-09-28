/**
 * Glyph selection for generated tokens (DESIGN.md §6.8, DATA-FORMATS.md §6). Pure lookups over
 * the mapping tables in resources/icons/mapping.json; the caller checks the result against the
 * fetched icon set and logs misses.
 */

export interface IconTableSet {
  creatureType: Record<string, string>;
  ancestry: Record<string, string>;
  nameKeywords: Record<string, string>;
  /** Word → replacement; an empty replacement drops the word (`dire`, `young`, …). */
  synonyms: Record<string, string>;
  itemType: Record<string, string>;
  spellSchool: Record<string, string>;
}

export type GlyphVia = 'ancestry' | 'keyword' | 'synonym' | 'type' | 'item' | 'school';

export interface GlyphMatch {
  icon: string;
  via: GlyphVia;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Longest keyword first so "hobgoblin" beats "goblin" and "sea hag" beats "hag". */
function keywordsByLength(table: Record<string, string>): string[] {
  return Object.keys(table).sort((a, b) => b.length - a.length);
}

function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s-])${escaped}(s|es)?($|[\\s-])`).test(haystack);
}

/** Applies the synonym table: blanked words are removed, others replaced. */
export function applySynonyms(name: string, synonyms: Record<string, string>): string {
  let out = ` ${normalize(name)} `;
  for (const word of keywordsByLength(synonyms)) {
    const replacement = synonyms[word] ?? '';
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<=[\\s-])${escaped}(s|es)?(?=[\\s-])`, 'g'), replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Creature chain: ancestry → name keywords → keywords after synonyms → creature type. Returns
 * null when nothing matches so the caller can log the miss.
 */
export function glyphForCreature(
  creature: { name: string; type?: string | null; ancestry?: string | null },
  tables: IconTableSet,
): GlyphMatch | null {
  if (creature.ancestry) {
    const icon = tables.ancestry[creature.ancestry] ?? tables.ancestry[creature.ancestry.trim()];
    if (icon) return { icon, via: 'ancestry' };
  }
  const name = normalize(creature.name);
  const keywords = keywordsByLength(tables.nameKeywords);
  for (const keyword of keywords) {
    if (containsWord(name, keyword)) return { icon: tables.nameKeywords[keyword]!, via: 'keyword' };
  }
  const replaced = applySynonyms(creature.name, tables.synonyms);
  if (replaced !== name) {
    for (const keyword of keywords) {
      if (containsWord(replaced, keyword)) {
        return { icon: tables.nameKeywords[keyword]!, via: 'synonym' };
      }
    }
  }
  const type = normalize(creature.type ?? '');
  for (const key of keywordsByLength(tables.creatureType)) {
    if (type === key || containsWord(type, key)) {
      return { icon: tables.creatureType[key]!, via: 'type' };
    }
  }
  return null;
}

/** Item chain: name keywords → item type code. */
export function glyphForItem(
  item: { name: string; typeCode?: string | null },
  tables: IconTableSet,
): GlyphMatch | null {
  const name = normalize(item.name);
  for (const keyword of keywordsByLength(tables.nameKeywords)) {
    if (containsWord(name, keyword)) return { icon: tables.nameKeywords[keyword]!, via: 'keyword' };
  }
  const icon = item.typeCode ? tables.itemType[item.typeCode.toUpperCase()] : undefined;
  return icon ? { icon, via: 'item' } : null;
}

/** Spell chain: school code. */
export function glyphForSpell(
  spell: { school?: string | null },
  tables: IconTableSet,
): GlyphMatch | null {
  const icon = spell.school ? tables.spellSchool[spell.school.toUpperCase()] : undefined;
  return icon ? { icon, via: 'school' } : null;
}

/** Every distinct icon name a table set refers to (for build-time verification). */
export function iconNamesIn(tables: IconTableSet): Set<string> {
  const names = new Set<string>();
  for (const table of [
    tables.creatureType,
    tables.ancestry,
    tables.nameKeywords,
    tables.itemType,
    tables.spellSchool,
  ]) {
    for (const icon of Object.values(table)) if (icon) names.add(icon);
  }
  return names;
}
