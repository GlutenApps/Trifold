import { describe, expect, it } from 'vitest';
import type { CharacterBuild } from '@trifold/schema';
import type { Race2014 } from './build2014';
import type { BackgroundOption, ClassOption } from './build2024';
import { buildSheet2014 } from './buildSheet2014';
import { blankSheet } from './derive';
import { levelUpSheet } from './levelUp';

/** The 2014 builder's sheet (docs/BUILDER.md, phase 8), from SRD 5.1 choices. */

const column = (name: string, level: number) =>
  name === 'Cantrips Known' ? (level < 4 ? '3' : '4') : '';
const wizard: ClassOption = {
  key: 'wizard',
  name: 'Wizard',
  hitDie: 6,
  saves: ['int', 'wis'],
  skills: { choose: 2, from: ['Arcana', 'History'] },
  armor: '',
  weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows',
  tools: '',
  equipment: [],
  equipmentLines: [
    '(a) a quarterstaff or (b) a dagger',
    "(a) a scholar's pack or (b) an explorer's pack",
    'A spellbook',
  ],
  primaryAbility: '',
  casterType: 'FULL',
  subclassLevel: 2,
  asiLevels: [4],
  column,
  features: (level) =>
    level === 1 ? [{ name: 'Arcane Recovery', text: 'You regain some spell slots.' }] : [],
};
const elf: Race2014 = {
  key: 'elf',
  name: 'Elf',
  size: 'Medium',
  speed: 30,
  increase: { fixed: { dex: 2 }, choose: 0 },
  languages: 'Common and Elvish',
  traits: [{ name: 'Darkvision', text: 'You can see in dim light within 60 feet.' }],
  subraces: [
    {
      key: 'high elf',
      name: 'High Elf',
      increase: { fixed: { int: 1 }, choose: 0 },
      traits: [{ name: 'Cantrip', text: 'You know one cantrip of your choice.' }],
    },
  ],
};
const acolyte: BackgroundOption = {
  key: 'acolyte',
  name: 'Acolyte',
  abilities: [],
  feat: '',
  featName: '',
  skills: ['Insight', 'Religion'],
  tool: '',
  equipment: ['A holy symbol, 5 sticks of incense, vestments, and a pouch containing 15 gp'],
  legacy: true,
  features: [{ name: 'Shelter of the Faithful', text: 'You command the respect of your faith.' }],
};
const ref = (kind: 'class' | 'species' | 'background', key: string, name: string) => ({
  kind,
  key,
  name,
});

const built = () =>
  buildSheet2014({
    cls: wizard,
    classRef: ref('class', 'wizard', 'Wizard'),
    race: elf,
    raceRef: ref('species', 'elf', 'Elf'),
    subrace: elf.subraces[0]!,
    subraceRef: ref('species', 'high elf', 'High Elf'),
    chosen: [],
    background: acolyte,
    backgroundRef: ref('background', 'acolyte', 'Acolyte'),
    abilityMethod: 'standard',
    baseScores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    classSkills: ['arcana', 'history'],
    languages: 'Common, Elvish',
    classPicks: [1, 0, 0],
    spells: [
      { ref: { kind: 'spell', key: 'fire bolt', name: 'Fire Bolt' }, level: 0 },
      { ref: { kind: 'spell', key: 'magic missile', name: 'Magic Missile' }, level: 1 },
      {
        ref: { kind: 'spell', key: 'shield', name: 'Shield' },
        level: 1,
        prepared: false,
      },
    ],
  });

describe('buildSheet2014', () => {
  it('raises scores by race and subrace, and takes the background’s skills, no increase', () => {
    const { sheet } = built();
    expect(sheet.abilities).toEqual({ str: 8, dex: 16, con: 13, int: 16, wis: 12, cha: 10 });
    expect(sheet.species).toBe('High Elf');
    expect(sheet.skills).toEqual({
      insight: 'proficient',
      religion: 'proficient',
      arcana: 'proficient',
      history: 'proficient',
    });
    expect(sheet.maxHp).toBe(7);
    expect(sheet.spellcastingAbility).toBe('int');
    expect(sheet.slots).toEqual([2]);
  });

  it('takes each equipment line’s choice, and the background’s kit and gold', () => {
    const { sheet } = built();
    expect(sheet.equipment.map((i) => [i.quantity, i.name])).toEqual([
      [1, 'Dagger'],
      [1, "Scholar's pack"],
      [1, 'Spellbook'],
      [1, 'Holy symbol'],
      [5, 'Sticks of incense'],
      [1, 'Vestments'],
    ]);
    expect(sheet.gp).toBe(15);
  });

  it('keeps features from class, race, subrace and background, and the spells as picked', () => {
    const { sheet, build } = built();
    expect(sheet.features.map((f) => [f.name, f.from])).toEqual([
      ['Arcane Recovery', 'Wizard 1'],
      ['Darkvision', 'Elf'],
      ['Cantrip', 'High Elf'],
      ['Shelter of the Faithful', 'Acolyte'],
    ]);
    expect(sheet.spells.map((s) => [s.name, s.prepared])).toEqual([
      ['Fire Bolt', false],
      ['Magic Missile', true],
      ['Shield', false],
    ]);
    expect(build).toMatchObject({
      edition: '2014',
      species: { key: 'elf' },
      race2014: { subrace: { key: 'high elf' }, chosen: [] },
    });
    expect(build.increase).toBeUndefined();
  });
});

describe('Level up, 2014', () => {
  it('follows the 2014 slots: a half caster gets its first at 2nd level', () => {
    const paladin: ClassOption = {
      ...wizard,
      name: 'Paladin',
      casterType: 'HALF',
      features: () => [],
    };
    const build: CharacterBuild = {
      ...built().build,
      class: { kind: 'class', key: 'paladin', name: 'Paladin' },
    };
    const sheet = {
      ...blankSheet(),
      classes: [{ name: 'Paladin', subclass: '', level: 1 }],
      slots: [],
    };
    expect(levelUpSheet({ sheet, build, cls: paladin, hitPoints: 7 }).sheet.slots).toEqual([2]);
  });
});
