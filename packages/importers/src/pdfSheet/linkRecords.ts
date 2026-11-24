import { normalizeKey } from '@trifold/rules';
import type { RecordKind, Sheet, SheetRef } from '@trifold/schema';

/**
 * Names on an imported sheet linked to compendium records (ADR 0073): the spells, items,
 * feats, species, background and classes a PDF names, matched by key, so the sheet can show
 * their text. A name with no match stays as written. Pure: `find` asks the index.
 */

/** The record a kind and key name, with its display name; null when there is none. */
export type FindRecord = (kind: RecordKind, key: string) => { key: string; name: string } | null;

/** A bracketed note that only counts or measures: "(1 day)", "(2 flasks)", "(50 feet)". */
const MEASURE =
  /^\s*\d|\b(?:day|days|feet|foot|ft|flasks?|pints?|lbs?|pounds?|pieces?|sheets?|arrows?|bolts?|needles?)\b/i;

/**
 * An item's key. Brackets on an item often name a different item ("Potion of Healing
 * (Greater)"), so their words stay part of the key, unless they only count or measure
 * ("Rations (1 day)" is rations).
 */
export function itemKey(name: string): string {
  const inside = /\(([^)]*)\)/.exec(name)?.[1];
  return normalizeKey(
    inside !== undefined && !MEASURE.test(inside) ? name.replace(/[()]/g, ' ') : name,
  );
}

/** Links what it can; returns the sheet and how many names were linked. */
export function linkSheetRecords(sheet: Sheet, find: FindRecord): { sheet: Sheet; linked: number } {
  let linked = 0;
  const ref = (kind: RecordKind, key: string): SheetRef | undefined => {
    if (!key) return undefined;
    const hit = find(kind, key);
    if (!hit) return undefined;
    linked += 1;
    return { kind, key: hit.key, name: hit.name };
  };
  // Spells, feats, species, backgrounds and classes: a bracket is a note ("Mage Hand (Tome)",
  // "Magic Initiate (Cleric)").
  const named = <T extends { name: string; ref?: SheetRef }>(
    row: T,
    kind: RecordKind,
    key = normalizeKey(row.name),
  ): T => {
    if (row.ref) return row;
    const r = ref(kind, key);
    return r ? { ...row, ref: r } : row;
  };

  const speciesRef = sheet.speciesRef ?? ref('species', normalizeKey(sheet.species));
  const backgroundRef = sheet.backgroundRef ?? ref('background', normalizeKey(sheet.background));
  const out: Sheet = {
    ...sheet,
    ...(speciesRef ? { speciesRef } : {}),
    ...(backgroundRef ? { backgroundRef } : {}),
    classes: sheet.classes.map((c) => named(c, 'class')),
    spells: sheet.spells.map((s) => named(s, 'spell')),
    equipment: sheet.equipment.map((i) => named(i, 'item', itemKey(i.name))),
    // Class and species features are not records; a feat is.
    features: sheet.features.map((f) => named(f, 'feat')),
  };
  return { sheet: out, linked };
}
