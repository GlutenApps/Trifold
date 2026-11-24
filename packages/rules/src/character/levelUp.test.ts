import { describe, expect, it } from 'vitest';
import { Sheet, type CharacterBuild, type ClassRecord } from '@trifold/schema';
import type { ClassOption } from './build2024';
import { builtLevel, levelUpSheet, readSubclass } from './levelUp';

const fighter: ClassOption = {
  key: 'fighter',
  name: 'Fighter',
  hitDie: 10,
  saves: ['str', 'con'],
  skills: { choose: 2, from: ['Athletics'] },
  armor: '',
  weapons: '',
  tools: '',
  equipment: [],
  primaryAbility: 'Strength',
  casterType: 'NONE',
  subclassLevel: 3,
  asiLevels: [4],
  column: () => '',
  features: (level) =>
    ({
      2: [{ name: 'Action Surge', text: 'Take one additional action.' }],
      3: [{ name: 'Fighter Subclass', text: 'You gain a Fighter subclass.' }],
      4: [{ name: 'Ability Score Improvement', text: 'You gain the ASI feat.' }],
    })[level] ?? [],
};
const wizard: ClassOption = {
  ...fighter,
  key: 'wizard',
  name: 'Wizard',
  hitDie: 6,
  casterType: 'FULL',
};

const champion = readSubclass({
  schemaVersion: 1,
  id: 'champ',
  kind: 'class',
  key: 'champion',
  name: 'Champion',
  displayName: 'Champion',
  sourceId: 'srd-2024',
  edition: '2024',
  tags: [],
  data: {
    levels: [
      {
        level: 3,
        scoreImprovement: false,
        features: [
          {
            name: 'Improved Critical',
            text: 'You score a Critical Hit on a 19 or 20.',
            optional: false,
            rolls: [],
            modifiers: [],
          },
        ],
        counters: [],
      },
    ],
    extra: { subclassOf: ['Fighter'] },
  },
} as unknown as ClassRecord)!;

const sheet = (level: number) =>
  Sheet.parse({
    classes: [{ name: 'Fighter', subclass: '', level }],
    abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
    maxHp: 12,
  });
const build: CharacterBuild = {
  edition: '2024',
  class: { kind: 'class', key: 'fighter', name: 'Fighter' },
  background: { kind: 'background', key: 'soldier', name: 'Soldier' },
  species: { kind: 'species', key: 'human', name: 'Human' },
  size: 'Medium',
  abilityMethod: 'standard',
  baseScores: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  increase: { plus2: 'str', plus1: 'con' },
  classSkills: [],
  hitPoints: [],
  improvements: [],
};

describe('Level up (docs/BUILDER.md)', () => {
  it('adds a level: hit points and the new features', () => {
    const out = levelUpSheet({ sheet: sheet(1), build, cls: fighter, hitPoints: 8 });
    expect(builtLevel(out.sheet)).toBe(2);
    expect(out.sheet.maxHp).toBe(20);
    expect(out.sheet.features.map((f) => `${f.name} (${f.from})`)).toEqual([
      'Action Surge (Fighter 2)',
    ]);
    expect(out.build.hitPoints).toEqual([8]);
  });

  it('takes the subclass at its level, without the class’s “Subclass” feature', () => {
    const out = levelUpSheet({
      sheet: sheet(2),
      build,
      cls: fighter,
      hitPoints: 8,
      subclass: { option: champion, ref: { kind: 'class', key: 'champion', name: 'Champion' } },
    });
    expect(out.sheet.classes[0]).toMatchObject({ level: 3, subclass: 'Champion' });
    expect(out.sheet.features.map((f) => f.name)).toEqual(['Improved Critical']);
    expect(out.build.subclass?.key).toBe('champion');
  });

  it('raises abilities at an ASI level, capped at 20, or takes a feat', () => {
    const plus2 = levelUpSheet({
      sheet: sheet(3),
      build,
      cls: fighter,
      hitPoints: 8,
      improvement: { kind: 'plus2', ability: 'str' },
    });
    expect(plus2.sheet.abilities.str).toBe(19);
    expect(plus2.sheet.features).toEqual([]);
    expect(plus2.build.improvements).toEqual([{ level: 4, detail: '+2 str' }]);
    const high = Sheet.parse({
      ...sheet(3),
      abilities: { ...sheet(3).abilities, str: 20, con: 19 },
    });
    const plus1 = levelUpSheet({
      sheet: high,
      build,
      cls: fighter,
      hitPoints: 8,
      improvement: { kind: 'plus1', abilities: ['str', 'con'] },
    });
    expect(plus1.sheet.abilities).toMatchObject({ str: 20, con: 20 });
    const feat = levelUpSheet({
      sheet: sheet(3),
      build,
      cls: fighter,
      hitPoints: 8,
      improvement: {
        kind: 'feat',
        feat: { kind: 'feat', key: 'alert', name: 'Alert' },
        text: 'You gain a bonus to Initiative.',
      },
    });
    expect(feat.sheet.features.map((f) => [f.name, f.from, f.text])).toEqual([
      ['Alert', 'Fighter 4', 'You gain a bonus to Initiative.'],
    ]);
  });

  it('adds spells and follows the class’s slots', () => {
    const out = levelUpSheet({
      sheet: Sheet.parse({ ...sheet(2), slots: [3] }),
      build,
      cls: wizard,
      hitPoints: 4,
      spells: [{ ref: { kind: 'spell', key: 'web', name: 'Web' }, level: 2 }],
    });
    expect(out.sheet.slots).toEqual([4, 2]);
    expect(out.sheet.spells.map((s) => [s.name, s.prepared])).toEqual([['Web', true]]);
  });
});
