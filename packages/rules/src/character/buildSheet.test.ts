import { describe, expect, it } from 'vitest';
import { Sheet } from '@trifold/schema';
import type { BackgroundOption, ClassOption, SpeciesOption } from './build2024';
import { buildSheet2024, skillKey, spellcastingAbilityOf } from './buildSheet';
import { deriveSheet } from './derive';

const cleric: ClassOption = {
  key: 'cleric',
  name: 'Cleric',
  hitDie: 8,
  saves: ['wis', 'cha'],
  skills: { choose: 2, from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
  armor: 'Light and Medium armor and Shields',
  weapons: 'Simple weapons',
  tools: '',
  equipment: ['A: Mace, 7 GP', 'B: 110 GP'],
  primaryAbility: 'Wisdom',
  casterType: 'FULL',
  subclassLevel: 3,
  asiLevels: [4, 8],
  column: () => '',
  features: (level) =>
    level === 1 ? [{ name: 'Spellcasting', text: 'You can cast Cleric spells.' }] : [],
};
const sage: BackgroundOption = {
  key: 'sage',
  name: 'Sage',
  abilities: ['con', 'int', 'wis'],
  feat: 'Magic Initiate (Wizard)',
  featName: 'Magic Initiate',
  skills: ['Arcana', 'History'],
  tool: 'Calligrapher’s Supplies',
  equipment: ['A: Quarterstaff, 8 GP', 'B: 50 GP'],
};
const dwarf: SpeciesOption = {
  key: 'dwarf',
  name: 'Dwarf',
  sizes: ['Medium'],
  speed: 30,
  traits: [{ name: 'Darkvision', text: 'You have Darkvision with a range of 120 feet.' }],
};
const ref = (kind: 'class' | 'background' | 'species', key: string, name: string) => ({
  kind,
  key,
  name,
});

describe('the guided builder writes a sheet (docs/BUILDER.md)', () => {
  it('makes a 1st-level sheet from its choices', () => {
    const { sheet, build } = buildSheet2024({
      edition: '2024',
      cls: cleric,
      classRef: ref('class', 'cleric', 'Cleric'),
      background: sage,
      backgroundRef: ref('background', 'sage', 'Sage'),
      featText: 'You learn two cantrips.',
      species: dwarf,
      speciesRef: ref('species', 'dwarf', 'Dwarf'),
      size: 'Medium',
      abilityMethod: 'standard',
      baseScores: { str: 10, dex: 12, con: 14, int: 8, wis: 15, cha: 13 },
      increase: { plus2: 'wis', plus1: 'con' },
      classSkills: ['insight', 'medicine'],
      languages: 'Common, Dwarvish',
    });
    expect(Sheet.parse(sheet)).toBeTruthy();
    expect(sheet.abilities).toMatchObject({ wis: 17, con: 15 });
    expect(sheet.classes).toEqual([
      {
        name: 'Cleric',
        ref: { kind: 'class', key: 'cleric', name: 'Cleric' },
        subclass: '',
        level: 1,
      },
    ]);
    expect(sheet.saves).toEqual(['wis', 'cha']);
    // The background's skills and the class's picks.
    expect(sheet.skills).toEqual({
      arcana: 'proficient',
      history: 'proficient',
      insight: 'proficient',
      medicine: 'proficient',
    });
    // Hit die maximum plus Con at 1st level.
    expect(sheet.maxHp).toBe(10);
    expect(sheet.speed).toBe(30);
    expect(sheet.spellcastingAbility).toBe('wis');
    expect(sheet.otherProficiencies).toContain('Armor: Light and Medium armor and Shields');
    expect(sheet.otherProficiencies).toContain('Languages: Common, Dwarvish');
    expect(sheet.features.map((f) => `${f.name} (${f.from})`)).toEqual([
      'Spellcasting (Cleric 1)',
      'Darkvision (Dwarf)',
      'Magic Initiate (Wizard) (Sage)',
    ]);
    expect(sheet.overrides).toEqual({});
    expect(deriveSheet(sheet).spellSaveDc?.value).toBe(13);
    expect(build).toMatchObject({
      class: { key: 'cleric' },
      abilityMethod: 'standard',
      baseScores: { wis: 15 },
      increase: { plus2: 'wis', plus1: 'con' },
      classSkills: ['insight', 'medicine'],
      hitPoints: [],
    });
  });

  it('reads skill names and a caster’s ability', () => {
    expect(skillKey('Sleight of Hand')).toBe('sleightOfHand');
    expect(skillKey('animal handling')).toBe('animalHandling');
    expect(skillKey('Cooking')).toBeNull();
    expect(
      spellcastingAbilityOf({ casterType: 'HALF', primaryAbility: 'Strength and Charisma' }),
    ).toBe('cha');
    expect(
      spellcastingAbilityOf({ casterType: 'HALF', primaryAbility: 'Dexterity and Wisdom' }),
    ).toBe('wis');
    expect(spellcastingAbilityOf({ casterType: 'NONE', primaryAbility: 'Strength' })).toBeNull();
  });
});
