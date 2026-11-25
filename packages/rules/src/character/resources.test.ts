import { describe, expect, it } from 'vitest';
import type { Sheet } from '@trifold/schema';
import { blankSheet } from './derive';
import {
  hitDice,
  castSpell,
  endConcentration,
  hitDieOf,
  longRest,
  setSlotsUsed,
  slotChoices,
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

describe('item charges', () => {
  const wand = (reset: 'short' | 'long' | 'dawn', used = 2) => ({
    id: `w-${reset}`,
    name: `Wand (${reset})`,
    quantity: 1,
    uses: { max: 7, used, reset },
  });
  const sheet = (): Sheet => ({
    ...blankSheet(),
    equipment: [wand('short'), wand('dawn'), wand('long', 0)],
  });

  it('a short rest refills only short-rest charges', () => {
    const out = shortRest(sheet());
    expect(out.sheet.equipment.map((i) => i.uses?.used)).toEqual([0, 2, 0]);
    expect(out.restored).toEqual(['Wand (short)']);
  });

  it('a long rest refills every charge, dawn ones too', () => {
    const out = longRest(sheet(), '2024');
    expect(out.sheet.equipment.map((i) => i.uses?.used)).toEqual([0, 0, 0]);
    expect(out.restored).toEqual(['Wand (short)', 'Wand (dawn)']);
  });
});

describe('casting (docs/CHARACTER-SHEET.md, items 13 and 14)', () => {
  const caster = (): Sheet => ({ ...blankSheet(), slots: [4, 3, 2], slotsUsed: [0, 3] });
  const bless = { id: 's1', name: 'Bless', level: 1 };
  const guidance = { id: 's0', name: 'Guidance', level: 0 };

  it('offers the spell’s own slot level and every higher one there is', () => {
    expect(slotChoices(caster(), 1)).toEqual([
      { level: 1, max: 4, left: 4 },
      { level: 2, max: 3, left: 0 },
      { level: 3, max: 2, left: 2 },
    ]);
    expect(slotChoices(caster(), 3).map((c) => c.level)).toEqual([3]);
    expect(slotChoices(caster(), 0).map((c) => c.level)).toEqual([1, 2, 3]);
  });

  it('spends a slot of the level chosen, higher to upcast, and refuses a spent or lower one', () => {
    expect(castSpell(caster(), bless, 3, false)!.sheet.slotsUsed).toEqual([0, 3, 1]);
    expect(castSpell(caster(), bless, 2, false)).toBeNull();
    expect(castSpell(caster(), { ...bless, level: 2 }, 1, false)).toBeNull();
  });

  it('a cantrip spends nothing', () => {
    const out = castSpell(caster(), guidance, 0, false)!;
    expect(out.sheet.slotsUsed).toEqual([0, 3]);
  });

  it('a concentration spell is concentrated on, ending the one before', () => {
    const first = castSpell(caster(), bless, 1, true)!;
    expect(first.ended).toBeNull();
    expect(first.sheet.concentrating).toEqual({ name: 'Bless', spellId: 's1' });
    const second = castSpell(first.sheet, guidance, 0, true)!;
    expect(second.ended).toBe('Bless');
    expect(second.sheet.concentrating?.name).toBe('Guidance');
    // A spell without concentration leaves it as it was.
    expect(castSpell(second.sheet, bless, 1, false)!.sheet.concentrating?.name).toBe('Guidance');
  });

  it('ends by hand or with a long rest, not a short one', () => {
    const on = castSpell(caster(), bless, 1, true)!.sheet;
    expect(endConcentration(on).concentrating).toBeUndefined();
    expect(shortRest(on).sheet.concentrating?.name).toBe('Bless');
    expect(longRest(on, '2024').sheet.concentrating).toBeUndefined();
  });
});
