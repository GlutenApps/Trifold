import { describe, expect, it } from 'vitest';
import { Character, Sheet, TableNumbers } from '@trifold/schema';
import {
  attackBonus,
  blankSheet,
  characterLevel,
  classLine,
  deriveSheet,
  parseClassLine,
  proficiencyForLevel,
  scoreModifier,
  sheetFromNumbers,
  tableNumbers,
} from './derive';

/** A 5th-level fighter, written as a player would fill the sheet in. */
const fighter = Sheet.parse({
  classes: [
    { name: 'Fighter', subclass: 'Champion', level: 3 },
    { name: 'Rogue', level: 2 },
  ],
  abilities: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
  saves: ['str', 'con'],
  skills: { athletics: 'proficient', perception: 'proficient', stealth: 'expertise' },
  maxHp: 44,
  armor: { kind: 'medium', base: 14, shield: true },
  attacks: [{ id: 'a1', name: 'Longsword', ability: 'str', damage: '1d8 slashing' }],
});

describe('character numbers (ADR 0068)', () => {
  it('works out modifiers, level and proficiency', () => {
    expect([1, 8, 9, 10, 11, 20, 30].map(scoreModifier)).toEqual([-5, -1, -1, 0, 0, 5, 10]);
    expect(characterLevel(fighter)).toBe(5);
    expect(characterLevel({ classes: [] })).toBe(1);
    expect([1, 4, 5, 9, 13, 17, 20].map(proficiencyForLevel)).toEqual([2, 2, 3, 4, 5, 6, 6]);
    expect(classLine(fighter)).toBe('Fighter (Champion) 3 / Rogue 2');
  });

  it('works out saves, skills, passives, AC and initiative', () => {
    const n = deriveSheet(fighter);
    expect(n.proficiencyBonus.value).toBe(3);
    expect(n.saves.str.value).toBe(6);
    expect(n.saves.dex.value).toBe(2);
    expect(n.skills.athletics.value).toBe(6);
    // Expertise doubles proficiency.
    expect(n.skills.stealth.value).toBe(8);
    expect(n.passivePerception.value).toBe(14);
    expect(n.passiveInsight.value).toBe(11);
    // Medium armour adds at most +2 Dex; a shield adds 2.
    expect(n.ac.value).toBe(18);
    expect(n.initiative.value).toBe(2);
    expect(n.spellSaveDc).toBeNull();
    expect(attackBonus(fighter.attacks[0]!, n)).toBe(6);
  });

  it('covers each kind of armour', () => {
    const ac = (armor: Partial<Sheet['armor']>) =>
      deriveSheet(Sheet.parse({ ...fighter, armor: { ...fighter.armor, shield: false, ...armor } }))
        .ac.value;
    expect(ac({ kind: 'none' })).toBe(12);
    expect(ac({ kind: 'light', base: 11 })).toBe(13);
    expect(ac({ kind: 'heavy', base: 18, bonus: 1 })).toBe(19);
  });

  it('works out spellcasting from its ability', () => {
    const n = deriveSheet(Sheet.parse({ ...fighter, spellcastingAbility: 'wis' }));
    expect(n.spellSaveDc?.value).toBe(12);
    expect(n.spellAttack?.value).toBe(4);
  });

  it('shows an override and keeps what the sheet works out', () => {
    const n = deriveSheet(Sheet.parse({ ...fighter, overrides: { ac: 20, 'skill.stealth': 9 } }));
    expect(n.ac).toEqual({ value: 20, base: 18, overridden: true });
    expect(n.skills.stealth).toEqual({ value: 9, base: 8, overridden: true });
    // A proficiency override flows into what uses it.
    expect(
      deriveSheet(Sheet.parse({ ...fighter, overrides: { proficiencyBonus: 4 } })).saves.str.value,
    ).toBe(7);
  });
});

describe('table numbers', () => {
  const now = '2026-11-23T00:00:00.000Z';
  const base = { schemaVersion: 1, id: 'c1', name: 'Aria', createdAt: now, updatedAt: now };

  it('are an External character’s numbers as entered', () => {
    const c = Character.parse({
      ...base,
      kind: 'external',
      numbers: { classText: 'Bard 4', level: 4, ac: 15 },
    });
    expect(tableNumbers(c)).toMatchObject({ classText: 'Bard 4', level: 4, ac: 15, maxHp: 10 });
  });

  it('are worked out from a Trifold sheet', () => {
    const c = Character.parse({ ...base, kind: 'trifold', sheet: fighter });
    const t = tableNumbers(c);
    expect(t).toMatchObject({
      classText: 'Fighter (Champion) 3 / Rogue 2',
      level: 5,
      maxHp: 44,
      ac: 18,
    });
    expect(t.passives).toEqual({ perception: 14, insight: 11, investigation: 9 });
    expect(t.saves).toEqual({ str: 6, dex: 2, con: 5, int: -1, wis: 1, cha: 0 });
    expect(t.spellSaveDc).toBeUndefined();
    expect(TableNumbers.parse(t)).toEqual(t);
  });

  it('keep an External character’s numbers when it becomes a Trifold one', () => {
    const numbers = TableNumbers.parse({
      classText: 'Wizard 6',
      level: 6,
      maxHp: 32,
      ac: 13,
      initiativeBonus: 3,
      passives: { perception: 13, insight: 12, investigation: 16 },
      saves: { int: 7, wis: 5 },
      spellSaveDc: 15,
    });
    const c = Character.parse({ ...base, kind: 'trifold', sheet: sheetFromNumbers(numbers) });
    const t = tableNumbers(c);
    expect(t).toMatchObject({
      classText: 'Wizard 6',
      level: 6,
      maxHp: 32,
      ac: 13,
      initiativeBonus: 3,
      spellSaveDc: 15,
    });
    expect(t.passives).toEqual(numbers.passives);
    expect(t.saves).toMatchObject({ int: 7, wis: 5 });
  });

  it('read a class line back into classes', () => {
    expect(parseClassLine('Fighter (Champion) 3 / Rogue 2', 5)).toEqual([
      { name: 'Fighter', subclass: 'Champion', level: 3 },
      { name: 'Rogue', subclass: '', level: 2 },
    ]);
    // Levels that do not add up, or a line without them, stay one class.
    expect(parseClassLine('Fighter 3 / Rogue 2', 6)).toEqual([
      { name: 'Fighter 3 / Rogue 2', subclass: '', level: 6 },
    ]);
    expect(parseClassLine('Paladin', 4)).toEqual([{ name: 'Paladin', subclass: '', level: 4 }]);
  });

  it('start a blank sheet at 1st level with nothing overridden', () => {
    expect(blankSheet().overrides).toEqual({});
    expect(Sheet.parse(blankSheet())).toEqual(blankSheet());
  });
});
