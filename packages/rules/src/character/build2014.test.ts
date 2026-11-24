import { describe, expect, it } from 'vitest';
import {
  equipmentChoices2014,
  equipmentItems2014,
  readRaceIncrease,
  spellSlots2014,
  withRaceIncrease,
} from './build2014';

/** The 2014 builder's rules (docs/BUILDER.md, phase 8), on SRD 5.1 text. */

const scores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

describe('race increases', () => {
  it('reads fixed increases, everyone’s +1, and +1s to pick', () => {
    expect(readRaceIncrease('Your Constitution score increases by 2.')).toEqual({
      fixed: { con: 2 },
      choose: 0,
    });
    expect(
      readRaceIncrease(
        'Your Strength score increases by 2, and your Charisma score increases by 1.',
      ),
    ).toEqual({ fixed: { str: 2, cha: 1 }, choose: 0 });
    expect(readRaceIncrease('Your ability scores each increase by 1.').fixed).toEqual({
      str: 1,
      dex: 1,
      con: 1,
      int: 1,
      wis: 1,
      cha: 1,
    });
    expect(
      readRaceIncrease(
        'Your Charisma score increases by 2, and two other ability scores of your choice increase by 1.',
      ),
    ).toEqual({ fixed: { cha: 2 }, choose: 2 });
  });

  it('adds the race’s, the subrace’s and the picked increases, none above 20', () => {
    const dwarf = { increase: { fixed: { con: 2 }, choose: 0 } };
    const hill = { increase: { fixed: { wis: 1 }, choose: 0 } };
    expect(withRaceIncrease(scores, dwarf, hill, [])).toMatchObject({ con: 15, wis: 11 });
    const halfElf = { increase: { fixed: { cha: 2 }, choose: 2 } };
    expect(withRaceIncrease(scores, halfElf, null, ['str', 'dex', 'con'])).toMatchObject({
      cha: 10,
      str: 16,
      dex: 15,
      con: 13,
    });
    expect(withRaceIncrease({ ...scores, con: 20 }, dwarf, null, []).con).toBe(20);
  });
});

describe('class equipment lines', () => {
  it('splits a line into its choices, or keeps a fixed item', () => {
    expect(
      equipmentChoices2014('(a) chain mail or (b) leather armor, longbow, and 20 arrows'),
    ).toEqual(['chain mail', 'leather armor, longbow, and 20 arrows']);
    expect(equipmentChoices2014('(a) a rapier, (b) a longsword, or (c) any simple weapon')).toEqual(
      ['a rapier', 'a longsword', 'any simple weapon'],
    );
    expect(equipmentChoices2014('A spellbook')).toEqual(['A spellbook']);
  });

  it('reads a choice’s items, counts and gold', () => {
    expect(equipmentItems2014('leather armor, longbow, and 20 arrows').items).toEqual([
      { name: 'Leather armor', quantity: 1 },
      { name: 'Longbow', quantity: 1 },
      { name: 'Arrows', quantity: 20 },
    ]);
    expect(equipmentItems2014('two handaxes').items).toEqual([{ name: 'Handaxes', quantity: 2 }]);
    expect(
      equipmentItems2014('5 sticks of incense, vestments, and a pouch containing 15 gp'),
    ).toEqual({
      items: [
        { name: 'Sticks of incense', quantity: 5 },
        { name: 'Vestments', quantity: 1 },
      ],
      gp: 15,
    });
  });
});

describe('2014 spell slots', () => {
  const column = () => '';
  it('gives a half caster no slots at 1st level, and the 2024 slots after', () => {
    expect(spellSlots2014({ casterType: 'HALF', column }, 1, [2])).toEqual([]);
    expect(spellSlots2014({ casterType: 'HALF', column }, 2, [2])).toEqual([2]);
    expect(spellSlots2014({ casterType: 'FULL', column }, 1, [2])).toEqual([2]);
  });

  it('puts a warlock’s slots at the level its class level gives', () => {
    const warlock = {
      casterType: 'PACT' as const,
      column: (n: string) => (n === 'Spell Slots' ? '2' : ''),
    };
    expect(spellSlots2014(warlock, 5, [])).toEqual([0, 0, 2]);
  });
});
