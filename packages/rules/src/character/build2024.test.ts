import { describe, expect, it } from 'vitest';
import type { BackgroundRecord, ClassRecord, FeatRecord, SpeciesRecord } from '@trifold/schema';
import {
  equipmentOptions,
  featCategory,
  fixedHitPointsPerLevel,
  hitPointsAtFirstLevel,
  optionGold,
  pointBuySpent,
  readBackground,
  readClass,
  readSpecies,
  rollAbilityScore,
  spellSlots,
  splitList,
  STANDARD_ARRAY,
  withBackgroundIncrease,
} from './build2024';

const header = { schemaVersion: 1, id: 'x', sourceId: 'srd-2024', edition: '2024', tags: [] };

/** A class as the SRD snapshot writes it (#108), with SRD text. */
const wizard = {
  ...header,
  kind: 'class',
  key: 'wizard',
  name: 'Wizard',
  displayName: 'Wizard',
  data: {
    hd: 6,
    proficiency:
      'Intelligence, Wisdom, Arcana, History, Insight, Investigation, Medicine, Nature, Religion',
    numSkills: 2,
    weapons: 'Simple weapons',
    levels: [
      {
        level: 1,
        scoreImprovement: false,
        features: [
          {
            name: 'Spellcasting',
            text: 'You have learned to cast spells.',
            optional: false,
            rolls: [],
            modifiers: [],
          },
        ],
        counters: [],
      },
      {
        level: 3,
        scoreImprovement: false,
        features: [
          {
            name: 'Wizard Subclass',
            text: 'You gain a Wizard subclass of your choice.',
            optional: false,
            rolls: [],
            modifiers: [],
          },
        ],
        counters: [],
      },
      { level: 4, scoreImprovement: true, features: [], counters: [] },
      { level: 8, scoreImprovement: true, features: [], counters: [] },
    ],
    extra: {
      casterType: ['FULL'],
      equipment: [
        'A: 2 Daggers, Arcane Focus (Quarterstaff), Robe, Spellbook, Scholar’s Pack, and 5 GP',
        'B: 55 GP',
      ],
      primaryAbility: ['Intelligence'],
      'table:Cantrips': [
        '3',
        '3',
        '3',
        '4',
        '4',
        '4',
        '4',
        '4',
        '4',
        '5',
        '5',
        '5',
        '5',
        '5',
        '5',
        '5',
        '5',
        '5',
        '5',
        '5',
      ],
    },
  },
} as unknown as ClassRecord;

const warlock = {
  ...wizard,
  key: 'warlock',
  displayName: 'Warlock',
  data: {
    ...wizard.data,
    hd: 8,
    extra: {
      casterType: ['PACT'],
      'table:Spell Slots': ['1', '2', '2', '2', '2'],
      'table:Slot Level': ['1st', '1st', '2nd', '2nd', '3rd'],
    },
  },
} as unknown as ClassRecord;

const acolyte = {
  ...header,
  kind: 'background',
  key: 'acolyte',
  name: 'Acolyte',
  displayName: 'Acolyte',
  data: {
    proficiency: 'Insight and Religion',
    traits: [
      {
        name: 'Ability Scores',
        text: 'Intelligence, Wisdom, Charisma',
        category: 'ability_score',
        rolls: [],
        modifiers: [],
      },
      {
        name: 'Equipment',
        text: '*Choose A or B:* (A) Holy Symbol, Robe, 8 GP; or (B) 50 GP',
        category: 'equipment',
        rolls: [],
        modifiers: [],
      },
      { name: 'Feat', text: 'Magic Initiate (Cleric)', category: 'feat', rolls: [], modifiers: [] },
      {
        name: 'Skill Proficiencies',
        text: 'Insight and Religion',
        category: 'skill_proficiency',
        rolls: [],
        modifiers: [],
      },
      {
        name: 'Tool Proficiency',
        text: 'Calligrapher’s Supplies',
        category: 'tool_proficiency',
        rolls: [],
        modifiers: [],
      },
    ],
    modifiers: [],
    extra: {},
  },
} as unknown as BackgroundRecord;

const human = {
  ...header,
  kind: 'species',
  key: 'human',
  name: 'Human',
  displayName: 'Human',
  data: {
    size: 'Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species',
    speed: '30 feet',
    spells: [],
    traits: [
      { name: 'Size', text: 'Medium or Small', category: 'size', rolls: [], modifiers: [] },
      { name: 'Speed', text: '30 feet', category: 'speed', rolls: [], modifiers: [] },
      {
        name: 'Resourceful',
        text: 'You gain Heroic Inspiration whenever you finish a Long Rest.',
        rolls: [],
        modifiers: [],
      },
    ],
    extra: {},
  },
} as unknown as SpeciesRecord;

describe('the builder’s readings of SRD records (docs/BUILDER.md)', () => {
  it('reads a class: saves, skill choice, equipment, caster type, subclass and ASI levels', () => {
    const c = readClass(wizard)!;
    expect(c).toMatchObject({
      name: 'Wizard',
      hitDie: 6,
      saves: ['int', 'wis'],
      skills: {
        choose: 2,
        from: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Nature', 'Religion'],
      },
      weapons: 'Simple weapons',
      armor: '',
      casterType: 'FULL',
      subclassLevel: 3,
      asiLevels: [4, 8],
      primaryAbility: 'Intelligence',
    });
    expect(c.equipment).toHaveLength(2);
    expect(c.column('Cantrips', 1)).toBe('3');
    expect(c.column('Cantrips', 10)).toBe('5');
    expect(c.column('Rages', 1)).toBe('');
    expect(c.features(1).map((f) => f.name)).toEqual(['Spellcasting']);
  });

  it('leaves a class without core traits, or a subclass, to the sheet', () => {
    expect(
      readClass({ ...wizard, data: { ...wizard.data, numSkills: undefined } } as ClassRecord),
    ).toBeNull();
    expect(
      readClass({
        ...wizard,
        data: { ...wizard.data, extra: { subclassOf: ['Wizard'] } },
      } as unknown as ClassRecord),
    ).toBeNull();
    const bard = readClass({
      ...wizard,
      data: {
        ...wizard.data,
        proficiency: 'Charisma, Dexterity',
        numSkills: 3,
        extra: { anySkills: ['true'] },
      },
    } as unknown as ClassRecord)!;
    expect(bard.skills).toEqual({ choose: 3, from: 'any' });
    expect(bard.saves).toEqual(['cha', 'dex']);
  });

  it('reads a background: its three abilities, feat, skills, tool and equipment', () => {
    expect(readBackground(acolyte)).toEqual({
      key: 'acolyte',
      name: 'Acolyte',
      abilities: ['int', 'wis', 'cha'],
      feat: 'Magic Initiate (Cleric)',
      featName: 'Magic Initiate',
      skills: ['Insight', 'Religion'],
      tool: 'Calligrapher’s Supplies',
      equipment: ['A: Holy Symbol, Robe, 8 GP', 'B: 50 GP'],
    });
    const bare = {
      ...acolyte,
      data: { ...acolyte.data, traits: [] },
    } as unknown as BackgroundRecord;
    expect(readBackground(bare)).toBeNull();
  });

  it('reads a species: its sizes, speed and traits', () => {
    expect(readSpecies(human)).toEqual({
      key: 'human',
      name: 'Human',
      sizes: ['Small', 'Medium'],
      speed: 30,
      traits: [
        {
          name: 'Resourceful',
          text: 'You gain Heroic Inspiration whenever you finish a Long Rest.',
        },
      ],
    });
  });

  it('sorts feats by their prerequisite', () => {
    const feat = (prerequisite?: string) =>
      ({ data: { ...(prerequisite ? { prerequisite } : {}) } }) as Pick<FeatRecord, 'data'>;
    expect(featCategory(feat())).toBe('origin');
    expect(featCategory(feat('Fighting Style Feature'))).toBe('fightingStyle');
    expect(featCategory(feat('Level 19+'))).toBe('epicBoon');
    expect(featCategory(feat('Level 4+, Strength or Dexterity 13+'))).toBe('general');
  });

  it('reads lists, equipment options and gold', () => {
    expect(splitList('Light, Medium, and Heavy armor')).toEqual(['Light', 'Medium', 'Heavy armor']);
    expect(
      equipmentOptions('Choose A or B: (A) Greataxe, 4 Handaxes, and 15 GP; or (B) 75 GP'),
    ).toEqual(['A: Greataxe, 4 Handaxes, and 15 GP', 'B: 75 GP']);
    expect(equipmentOptions('Herbalism Kit')).toEqual(['Herbalism Kit']);
    expect(optionGold('A: Greataxe, 4 Handaxes, and 15 GP')).toBe(15);
    expect(optionGold('B: 75 GP')).toBe(75);
  });
});

describe('the builder’s rules arithmetic', () => {
  it('costs point buy, and refuses a score outside 8–15', () => {
    expect(pointBuySpent([15, 15, 15, 8, 8, 8])).toBe(27);
    expect(pointBuySpent([13, 13, 13, 12, 12, 12])).toBe(27);
    expect(pointBuySpent([16, 8, 8, 8, 8, 8])).toBeNull();
    expect([...STANDARD_ARRAY].sort((a, b) => b - a)).toEqual([15, 14, 13, 12, 10, 8]);
  });

  it('rolls 4d6 and drops the lowest', () => {
    const dice = [3, 6, 1, 5];
    expect(rollAbilityScore(() => dice.shift()!)).toEqual({ score: 14, dice: [3, 6, 1, 5] });
  });

  it('adds the background increase, two ways, never above 20', () => {
    const base = { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 19 };
    expect(withBackgroundIncrease(base, { plus2: 'int', plus1: 'wis' })).toMatchObject({
      int: 17,
      wis: 13,
    });
    expect(withBackgroundIncrease(base, { all: ['int', 'wis', 'cha'] })).toMatchObject({
      int: 16,
      wis: 13,
      cha: 20,
    });
  });

  it('works out hit points', () => {
    expect(hitPointsAtFirstLevel(6, 2)).toBe(8);
    expect(hitPointsAtFirstLevel(6, -9)).toBe(1);
    expect(fixedHitPointsPerLevel(10, 1)).toBe(7);
    expect(fixedHitPointsPerLevel(6, 0)).toBe(4);
  });

  it('gives spell slots by caster type', () => {
    const wiz = readClass(wizard)!;
    expect(spellSlots(wiz, 1)).toEqual([2]);
    expect(spellSlots(wiz, 5)).toEqual([4, 3, 2]);
    expect(spellSlots(wiz, 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    expect(spellSlots({ ...wiz, casterType: 'HALF' }, 1)).toEqual([2]);
    expect(spellSlots({ ...wiz, casterType: 'HALF' }, 9)).toEqual([4, 3, 2]);
    expect(spellSlots({ ...wiz, casterType: 'NONE' }, 9)).toEqual([]);
    const pact = readClass(warlock)!;
    expect(spellSlots(pact, 1)).toEqual([1]);
    expect(spellSlots(pact, 5)).toEqual([0, 0, 2]);
  });
});
