import { describe, expect, it } from 'vitest';
import { Character, PCCard } from '@trifold/schema';
import { blankSheet } from '../character/derive';
import { fitSheetShare, jsonBytes, playerSheetOf, SHEET_SHARE_BYTES } from './sheetShare';

/** Sharing a player's sheet with the GM's Trifold (ADR 0078). */

const character = Character.parse({
  schemaVersion: 1,
  id: 'K1',
  name: 'Odessa',
  kind: 'trifold',
  sheet: {
    ...blankSheet(),
    features: [
      {
        id: 'f1',
        name: 'Darkvision',
        text: 'You see in the dark.',
        ref: { kind: 'species', key: 'dwarf', name: 'Dwarf' },
      },
      { id: 'f2', name: 'Lucky charm', text: 'A charm from home.' },
    ],
  },
  notes: 'Owes the ferryman 5 gp. The GM must not know.',
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
});

describe('playerSheetOf', () => {
  it('keeps what the sheet shows and leaves the private notes and the builder’s choices out', () => {
    const shared = playerSheetOf({ ...character, build: undefined });
    expect(shared).not.toHaveProperty('notes');
    expect(shared).not.toHaveProperty('build');
    expect(shared.sheet?.features.map((f) => f.name)).toEqual(['Darkvision', 'Lucky charm']);
  });

  it('fits on a PC card', () => {
    const pc = PCCard.parse({
      schemaVersion: 2,
      id: 'p1',
      name: 'Odessa',
      playerSheet: {
        character: playerSheetOf(character),
        from: 'Sam',
        sharedAt: '2026-11-24T00:00:00.000Z',
      },
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    });
    expect(pc.playerSheet?.character.name).toBe('Odessa');
  });
});

describe('fitSheetShare', () => {
  it('sends a sheet that fits as it is', () => {
    const shared = playerSheetOf(character);
    expect(fitSheetShare(shared)).toBe(shared);
  });

  it('drops linked features’ text first, then all feature text, then gives up', () => {
    const long = 'x'.repeat(19_000);
    const many = (linked: boolean, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `f${i}`,
        name: `Feature ${i}`,
        from: '',
        text: long,
        ...(linked ? { ref: { kind: 'feat' as const, key: `f${i}`, name: `F${i}` } } : {}),
      }));
    const sheet = playerSheetOf(character);
    const withFeatures = (features: ReturnType<typeof many>) => ({
      ...sheet,
      sheet: { ...sheet.sheet!, features },
    });

    // Fourteen linked features overflow; without their text they fit, and the rest is kept.
    const linked = fitSheetShare(withFeatures([...many(true, 14), ...many(false, 1)]))!;
    expect(jsonBytes(linked)).toBeLessThan(SHEET_SHARE_BYTES);
    expect(linked.sheet!.features.filter((f) => f.ref).every((f) => f.text === '')).toBe(true);
    expect(linked.sheet!.features.find((f) => !f.ref)?.text).toBe(long);

    // Unlinked features overflow too: all their text goes.
    const unlinked = fitSheetShare(withFeatures(many(false, 14)))!;
    expect(unlinked.sheet!.features.every((f) => f.text === '')).toBe(true);

    // Even without any text, too much: not shared.
    const names = Array.from({ length: 3000 }, (_, i) => ({
      id: `n${i}`,
      name: 'y'.repeat(100),
      from: '',
      text: '',
    }));
    expect(fitSheetShare(withFeatures(names))).toBeNull();
  });
});
