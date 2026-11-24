import { describe, expect, it } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { RecordKind } from '@trifold/schema';
import { itemKey, linkSheetRecords, type FindRecord } from './linkRecords';

/** Linking an imported sheet's names to compendium records (ADR 0073), with SRD names. */

const records: Record<string, string> = {
  'spell:fire bolt': 'Fire Bolt',
  'spell:mage hand': 'Mage Hand',
  'item:longsword': 'Longsword',
  'item:rations': 'Rations',
  'item:potion of healing': 'Potion of Healing',
  'feat:alert': 'Alert',
  'feat:magic initiate': 'Magic Initiate',
  'species:dwarf': 'Dwarf',
  'background:sage': 'Sage',
  'class:wizard': 'Wizard',
};
const find: FindRecord = (kind: RecordKind, key: string) => {
  const name = records[`${kind}:${key}`];
  return name ? { key, name } : null;
};
const id = (n: number) => `x${n}`;

describe('itemKey', () => {
  it('keeps bracketed words that name another item, and drops counts and measures', () => {
    expect(itemKey('Potion of Healing (Greater)')).toBe('potion of healing greater');
    expect(itemKey('Rations (1 day)')).toBe('rations');
    expect(itemKey('Rope, Hempen (50 feet)')).toBe('rope hempen');
    expect(itemKey('Longsword')).toBe('longsword');
  });
});

describe('linkSheetRecords', () => {
  it('links what the compendium has by key, and leaves the rest as written', () => {
    const sheet = {
      ...blankSheet(),
      species: 'Dwarf',
      background: 'Sage',
      classes: [{ name: 'Wizard', subclass: '', level: 3 }],
      spells: [
        { id: id(1), name: 'Fire Bolt', level: 0, prepared: false },
        { id: id(2), name: 'Mage Hand (Tome)', level: 0, prepared: false },
        { id: id(3), name: 'Quick Clothier', level: 1, prepared: true },
      ],
      equipment: [
        { id: id(4), name: 'Longsword', quantity: 1 },
        { id: id(5), name: 'Rations (1 day)', quantity: 10 },
        { id: id(6), name: 'Potion of Healing (Greater)', quantity: 2 },
      ],
      features: [
        { id: id(7), name: 'Magic Initiate (Cleric)', from: 'Feat', text: '' },
        { id: id(8), name: 'Arcane Recovery', from: 'Wizard', text: '' },
      ],
    };
    const { sheet: out, linked } = linkSheetRecords(sheet, find);
    expect(out.speciesRef).toEqual({ kind: 'species', key: 'dwarf', name: 'Dwarf' });
    expect(out.backgroundRef).toEqual({ kind: 'background', key: 'sage', name: 'Sage' });
    expect(out.classes[0]!.ref).toEqual({ kind: 'class', key: 'wizard', name: 'Wizard' });
    expect(out.spells.map((s) => s.ref?.key ?? null)).toEqual(['fire bolt', 'mage hand', null]);
    expect(out.equipment.map((i) => i.ref?.key ?? null)).toEqual(['longsword', 'rations', null]);
    expect(out.features.map((f) => f.ref?.key ?? null)).toEqual(['magic initiate', null]);
    // The names stay as the sheet wrote them.
    expect(out.spells[1]!.name).toBe('Mage Hand (Tome)');
    expect(linked).toBe(8);
  });

  it('keeps a link a row already has', () => {
    const sheet = {
      ...blankSheet(),
      spells: [
        {
          id: id(1),
          name: 'Fire Bolt',
          level: 0,
          prepared: false,
          ref: { kind: 'spell' as const, key: 'fire bolt', name: 'Fire Bolt' },
        },
      ],
    };
    expect(linkSheetRecords(sheet, () => null).sheet.spells[0]!.ref?.key).toBe('fire bolt');
  });
});
