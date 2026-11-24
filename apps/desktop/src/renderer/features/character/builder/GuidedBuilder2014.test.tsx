import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, CharacterBuild, CompendiumRecord, Sheet } from '@trifold/schema';
import { blankSheet } from '@trifold/rules';
import { useCharacterStore } from '../../../stores/characterStore';
import { CharactersPage } from '../CharactersPage';
import { GuidedBuilder2014 } from './GuidedBuilder2014';
import { LevelUpPanel } from './LevelUpPanel';

/** The 2014 guided builder (docs/BUILDER.md, phase 8), on SRD 5.1 records as the snapshot holds them. */

const old = { schemaVersion: 1, sourceId: 'srd-2014', edition: '2014', tags: [] };
const feature = (name: string, text: string) => ({
  name,
  text,
  optional: false,
  rolls: [],
  modifiers: [],
});
const trait = (name: string, text: string, category?: string) => ({
  name,
  text,
  ...(category ? { category } : {}),
  rolls: [],
  modifiers: [],
});

const records = [
  {
    ...old,
    id: 'c1',
    kind: 'class',
    key: 'cleric',
    name: 'Cleric',
    displayName: 'Cleric',
    data: {
      hd: 8,
      proficiency: 'Wisdom, Charisma, History, Insight, Medicine, Persuasion, Religion',
      numSkills: 2,
      armor: 'Light armor, medium armor, shields',
      weapons: 'All simple weapons',
      levels: [
        {
          level: 1,
          scoreImprovement: false,
          features: [
            feature('Spellcasting', 'You can cast cleric spells.'),
            feature('Divine Domain', 'Choose one domain related to your deity.'),
          ],
          counters: [],
        },
      ],
      extra: {
        casterType: ['FULL'],
        equipmentChoices: ['(a) a mace or (b) a warhammer', 'A shield and a holy symbol'],
        'table:Cantrips Known': Array(20).fill('3'),
      },
    },
  },
  {
    ...old,
    id: 'c2',
    kind: 'class',
    key: 'life domain',
    name: 'Life Domain',
    displayName: 'Life Domain',
    data: {
      levels: [
        {
          level: 1,
          scoreImprovement: false,
          features: [feature('Disciple of Life', 'Your healing spells are more effective.')],
          counters: [],
        },
      ],
      extra: { subclassOf: ['Cleric'] },
    },
  },
  {
    ...old,
    id: 's1',
    kind: 'species',
    key: 'dwarf',
    name: 'Dwarf',
    displayName: 'Dwarf',
    data: {
      spells: [],
      traits: [
        trait('Ability Score Increase', 'Your Constitution score increases by 2.'),
        trait('Speed', 'Your base walking speed is 25 feet.'),
        trait('Size', 'Your size is Medium.'),
        trait('Languages', 'You can speak, read, and write Common and Dwarvish.'),
        trait('Darkvision', 'You can see in dim light within 60 feet.'),
      ],
      extra: {},
    },
  },
  {
    ...old,
    id: 's2',
    kind: 'species',
    key: 'hill dwarf',
    name: 'Hill Dwarf',
    displayName: 'Hill Dwarf',
    data: {
      spells: [],
      traits: [
        trait('Ability Score Increase', 'Your Wisdom score increases by 1.'),
        trait('Dwarven Toughness', 'Your hit point maximum increases by 1.'),
      ],
      extra: { subspeciesOf: ['dwarf'] },
    },
  },
  {
    ...old,
    id: 'b1',
    kind: 'background',
    key: 'acolyte',
    name: 'Acolyte',
    displayName: 'Acolyte',
    data: {
      traits: [
        trait('Skill Proficiencies', 'Insight, Religion', 'skill_proficiency'),
        trait('Equipment', 'A holy symbol, vestments, and a pouch containing 15 gp', 'equipment'),
        trait('Shelter of the Faithful', 'You command the respect of your faith.', 'feature'),
      ],
      extra: {},
    },
  },
  {
    ...old,
    id: 'p1',
    kind: 'spell',
    key: 'sacred flame',
    name: 'Sacred Flame',
    displayName: 'Sacred Flame',
    data: { level: 0, classes: ['Cleric'], text: 'Flame-like radiance.', rolls: [], extra: {} },
  },
  {
    ...old,
    id: 'p2',
    kind: 'spell',
    key: 'bless',
    name: 'Bless',
    displayName: 'Bless',
    data: { level: 1, classes: ['Cleric'], text: 'You bless creatures.', rolls: [], extra: {} },
  },
] as unknown as CompendiumRecord[];

beforeEach(() => {
  vi.mocked(window.trifold.compendium.search).mockImplementation(async (q) => ({
    rows: records
      .filter((r) => r.kind === q.kind && (q.sourceIds ?? []).includes(r.sourceId))
      .map((r) => ({ id: r.id }) as never),
    total: 0,
    tookMs: 0,
  }));
  vi.mocked(window.trifold.compendium.get).mockImplementation(
    async (id) => records.find((r) => r.id === id) ?? null,
  );
});

describe('GuidedBuilder2014', () => {
  it('builds a 2014 cleric: domain at 1st level, a subrace, the race’s increases, and spells', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<GuidedBuilder2014 name="Odessa" onCancel={() => undefined} onFinish={onFinish} />);
    const builder = await screen.findByTestId('guided-builder');
    expect(builder).toHaveTextContent('2014 rules');

    await user.click(within(builder).getByRole('radio', { name: /^Cleric/ }));
    const next = within(builder).getByRole('button', { name: 'Next' });
    await user.click(within(builder).getByRole('checkbox', { name: 'Insight' }));
    await user.click(within(builder).getByRole('checkbox', { name: 'Medicine' }));
    // The cleric takes its domain at 1st level.
    expect(next).toBeDisabled();
    await user.selectOptions(
      within(builder).getByRole('combobox', { name: 'Subclass' }),
      'life domain',
    );
    await user.click(next);

    await user.click(within(builder).getByRole('radio', { name: /^Dwarf/ }));
    expect(within(builder).getByRole('radio', { name: /Hill Dwarf/ })).toBeChecked();
    expect(within(builder).getByRole('textbox', { name: 'Languages' })).toHaveValue(
      'You can speak, read, and write Common and Dwarvish.',
    );
    await user.click(next);

    await user.click(within(builder).getByRole('radio', { name: /^Acolyte/ }));
    await user.click(next);

    for (const [ability, value] of [
      ['Strength', '14'],
      ['Dexterity', '10'],
      ['Constitution', '13'],
      ['Intelligence', '8'],
      ['Wisdom', '15'],
      ['Charisma', '12'],
    ] as const) {
      // Standard array: an option's text is the score.
      await user.selectOptions(within(builder).getByRole('combobox', { name: ability }), value);
    }
    expect(within(builder).getByTestId('final-scores')).toHaveTextContent('CON 15 (+2)');
    expect(within(builder).getByTestId('final-scores')).toHaveTextContent('WIS 16 (+3)');
    await user.click(next);

    // Equipment: the warhammer instead of the mace; the acolyte's kit and gold.
    await user.click(within(builder).getByRole('radio', { name: 'a warhammer' }));
    expect(within(builder).getByTestId('kit-summary')).toHaveTextContent('15 GP');
    await user.click(next);

    // Spells: three cantrips known; prepared spells are Wisdom +3 plus level 1 = 4.
    expect(within(builder).getByText(/Prepared spells: choose 4/)).toBeInTheDocument();
    await user.click(within(builder).getByRole('checkbox', { name: 'Sacred Flame' }));
    await user.click(within(builder).getByRole('checkbox', { name: 'Bless' }));
    await user.click(next);

    await user.click(within(builder).getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const [sheet, build] = onFinish.mock.calls[0]! as [Sheet, CharacterBuild];
    expect(sheet.species).toBe('Hill Dwarf');
    expect(sheet.classes[0]).toMatchObject({ name: 'Cleric', subclass: 'Life Domain', level: 1 });
    expect(sheet.abilities).toMatchObject({ con: 15, wis: 16 });
    expect(sheet.speed).toBe(25);
    expect(sheet.spellcastingAbility).toBe('wis');
    expect(sheet.spells.map((s) => [s.name, s.prepared])).toEqual([
      ['Sacred Flame', false],
      ['Bless', true],
    ]);
    expect(sheet.equipment.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Warhammer', 'Holy symbol', 'Vestments']),
    );
    expect(sheet.features.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        'Disciple of Life',
        'Darkvision',
        'Dwarven Toughness',
        'Shelter of the Faithful',
      ]),
    );
    expect(build).toMatchObject({
      edition: '2014',
      subclass: { key: 'life domain' },
      race2014: { subrace: { key: 'hill dwarf' } },
    });
  });
});

describe('the 2014 builder from New character, and Level up', () => {
  it('opens when Legacy rules is chosen beside Guided builder', async () => {
    vi.mocked(window.trifold.characters.list).mockResolvedValue([]);
    useCharacterStore.setState({ characters: [], loaded: false, building: null });
    const user = userEvent.setup();
    render(<CharactersPage />);
    await user.click(await screen.findByRole('button', { name: 'New character' }));
    const panel = within(screen.getByTestId('new-character'));
    await user.selectOptions(panel.getByRole('combobox', { name: 'Builder rules' }), '2014');
    await user.click(panel.getByRole('button', { name: 'Start' }));
    expect(await screen.findByTestId('guided-builder')).toHaveTextContent('2014 rules');
    expect(useCharacterStore.getState().building?.edition).toBe('2014');
  });

  it('levels a 2014 character from the SRD 5.1 class', async () => {
    const character: Character = {
      schemaVersion: 1,
      id: 'K1',
      name: 'Odessa',
      kind: 'trifold',
      edition: '2014',
      numbers: {
        classText: '',
        level: 1,
        maxHp: 10,
        ac: 10,
        initiativeBonus: 0,
        speed: 25,
        passives: { perception: 10, insight: 10, investigation: 10 },
        saves: {},
      },
      sheet: {
        ...blankSheet(),
        classes: [{ name: 'Cleric', subclass: 'Life Domain', level: 1 }],
        abilities: { str: 14, dex: 10, con: 15, int: 8, wis: 16, cha: 12 },
        maxHp: 10,
      },
      build: {
        edition: '2014',
        class: { kind: 'class', key: 'cleric', name: 'Cleric' },
        background: { kind: 'background', key: 'acolyte', name: 'Acolyte' },
        species: { kind: 'species', key: 'dwarf', name: 'Dwarf' },
        size: 'Medium',
        abilityMethod: 'standard',
        baseScores: { str: 14, dex: 10, con: 13, int: 8, wis: 15, cha: 12 },
        race2014: {
          subrace: { kind: 'species', key: 'hill dwarf', name: 'Hill Dwarf' },
          chosen: [],
        },
        classSkills: [],
        hitPoints: [],
        subclass: { kind: 'class', key: 'life domain', name: 'Life Domain' },
        improvements: [],
      },
      notes: '',
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    };
    render(
      <LevelUpPanel character={character} onApply={() => undefined} onClose={() => undefined} />,
    );
    expect(await screen.findByText('Level up to Cleric 2')).toBeInTheDocument();
    // d8 fixed is 5, plus Con +2.
    expect(screen.getByTestId('levelup-hp')).toHaveTextContent('+7 HP');
  });
});
