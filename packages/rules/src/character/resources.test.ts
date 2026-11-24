import { describe, expect, it } from 'vitest';
import type { Sheet } from '@trifold/schema';
import { blankSheet } from './derive';
import {
  hitDice,
  hitDieOf,
  longRest,
  setSlotsUsed,
  shortRest,
  slotsAt,
  spendHitDie,
  spendSlot,
} from './resources';

/** Resources and rests (ADR 0074). */

const sheet = (extra: Partial<Sheet> = {}): Sheet => ({
  ...blankSheet(),
  classes: [
    { name: 'Cleric', subclass: '', level: 4 },
    { name: 'Fighter', subclass: '', level: 2 },
  ],
  abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
  slots: [4, 3],
  features: [
    {
      id: 'f1',
      name: 'Channel Divinity',
      from: 'Cleric',
      text: '',
      uses: { max: 2, used: 2, reset: 'short' },
    },
    {
      id: 'f2',
      name: 'Second Wind',
      from: 'Fighter',
      text: '',
      uses: { max: 2, used: 1, reset: 'long' },
    },
    { id: 'f3', name: 'Spellcasting', from: 'Cleric', text: '' },
  ],
  ...extra,
});

describe('hit dice', () => {
  it('counts one per class level by die size, largest first, less those spent', () => {
    expect(hitDieOf('Fighter')).toBe('10');
    expect(hitDieOf('Unknown class')).toBe('8');
    expect(hitDice(sheet({ hitDiceUsed: { '8': 3 } }))).toEqual([
      { die: '10', total: 2, left: 2 },
      { die: '8', total: 4, left: 1 },
    ]);
  });

  it('spends one: the roll plus Constitution, at least 1, and marks it', () => {
    const out = spendHitDie(sheet(), '8', () => 5)!;
    expect(out.healed).toBe(7);
    expect(out.rolled).toBe(5);
    expect(out.sheet.hitDiceUsed).toEqual({ '8': 1 });
    const weak = { ...sheet(), abilities: { ...sheet().abilities, con: 3 } };
    expect(spendHitDie(weak, '8', () => 1)!.healed).toBe(1);
    expect(spendHitDie(sheet({ hitDiceUsed: { '10': 2 } }), '10', () => 5)).toBeNull();
  });
});

describe('rests', () => {
  it('a short rest brings back short-rest features, and slots only with Pact Magic', () => {
    const spent = sheet({ slotsUsed: [2, 1] });
    const { sheet: after, restored } = shortRest(spent);
    expect(after.features.map((f) => f.uses?.used ?? null)).toEqual([0, 1, null]);
    expect(after.slotsUsed).toEqual([2, 1]);
    expect(restored).toEqual(['Channel Divinity']);
    const pact = shortRest({ ...spent, slotsOnShortRest: true });
    expect(pact.sheet.slotsUsed).toEqual([]);
    expect(pact.restored).toEqual(['Channel Divinity', 'spell slots']);
  });

  it('a long rest brings back every use and slot, and every hit die under the 2024 rules', () => {
    const spent = sheet({ slotsUsed: [2], hitDiceUsed: { '8': 4, '10': 2 } });
    const { sheet: after, restored } = longRest(spent, '2024');
    expect(after.features.map((f) => f.uses?.used ?? null)).toEqual([0, 0, null]);
    expect(after.slotsUsed).toEqual([]);
    expect(after.hitDiceUsed).toEqual({});
    expect(restored).toEqual(['Channel Divinity', 'Second Wind', 'spell slots', 'hit dice']);
  });

  it('under the 2014 rules gives back half the hit dice, largest first', () => {
    // Six levels: three dice come back, the two d10s first, then one d8.
    const after = longRest(sheet({ hitDiceUsed: { '8': 4, '10': 2 } }), '2014').sheet;
    expect(after.hitDiceUsed).toEqual({ '10': 0, '8': 3 });
  });
});

describe('spell slots', () => {
  const caster = (): Sheet => ({ ...blankSheet(), slots: [4, 3, 2], slotsUsed: [1] });

  it('says how many of a level there are and how many are left', () => {
    expect(slotsAt(caster(), 1)).toEqual({ max: 4, left: 3 });
    expect(slotsAt(caster(), 2)).toEqual({ max: 3, left: 3 });
    expect(slotsAt(caster(), 4)).toEqual({ max: 0, left: 0 });
  });

  it('casting spends one of that level, and nothing when none is left', () => {
    const once = spendSlot(caster(), 3)!;
    expect(once.slotsUsed).toEqual([1, 0, 1]);
    const twice = spendSlot(once, 3)!;
    expect(spendSlot(twice, 3)).toBeNull();
    expect(spendSlot(caster(), 5)).toBeNull();
  });

  it('marks slots used within what the level has', () => {
    expect(setSlotsUsed(caster(), 2, 5).slotsUsed).toEqual([1, 3]);
    expect(setSlotsUsed(caster(), 1, -1).slotsUsed).toEqual([0]);
  });
});
