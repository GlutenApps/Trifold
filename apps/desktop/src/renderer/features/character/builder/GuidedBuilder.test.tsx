import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumRecord, Sheet } from '@trifold/schema';
import { GuidedBuilder } from './GuidedBuilder';

const header = { schemaVersion: 1, sourceId: 'srd-2024', edition: '2024', tags: [] };

/** SRD-text records, as the snapshot holds them. */
const records = [
  {
    ...header,
    id: 'c1',
    kind: 'class',
    key: 'cleric',
    name: 'Cleric',
    displayName: 'Cleric',
    data: {
      hd: 8,
      proficiency: 'Wisdom, Charisma, History, Insight, Medicine, Persuasion, Religion',
      numSkills: 2,
      armor: 'Light and Medium armor and Shields',
      weapons: 'Simple weapons',
      levels: [
        {
          level: 1,
          scoreImprovement: false,
          features: [
            {
              name: 'Spellcasting',
              text: 'You can cast Cleric spells.',
              optional: false,
              rolls: [],
              modifiers: [],
            },
          ],
          counters: [],
        },
      ],
      extra: {
        casterType: ['FULL'],
        primaryAbility: ['Wisdom'],
        equipment: ['A: Mace, 7 GP', 'B: 110 GP'],
        'table:Cantrips': Array(20).fill('1'),
        'table:Prepared Spells': Array(20).fill('1'),
      },
    },
  },
  {
    ...header,
    id: 'b1',
    kind: 'background',
    key: 'sage',
    name: 'Sage',
    displayName: 'Sage',
    data: {
      traits: [
        {
          name: 'Ability Scores',
          text: 'Constitution, Intelligence, Wisdom',
          category: 'ability_score',
          rolls: [],
          modifiers: [],
        },
        {
          name: 'Feat',
          text: 'Magic Initiate (Wizard)',
          category: 'feat',
          rolls: [],
          modifiers: [],
        },
        {
          name: 'Skill Proficiencies',
          text: 'Arcana and History',
          category: 'skill_proficiency',
          rolls: [],
          modifiers: [],
        },
      ],
      modifiers: [],
      extra: {},
    },
  },
  {
    ...header,
    id: 's1',
    kind: 'species',
    key: 'dwarf',
    name: 'Dwarf',
    displayName: 'Dwarf',
    data: {
      size: 'Medium (about 4–5 feet tall)',
      speed: '30 feet',
      spells: [],
      traits: [{ name: 'Darkvision', text: 'You see in the dark.', rolls: [], modifiers: [] }],
      extra: {},
    },
  },
  {
    ...header,
    id: 'f1',
    kind: 'feat',
    key: 'magic initiate',
    name: 'Magic Initiate',
    displayName: 'Magic Initiate',
    data: { text: 'You learn two cantrips.', rolls: [], modifiers: [], extra: {} },
  },
  {
    ...header,
    id: 'sp1',
    kind: 'spell',
    key: 'light',
    name: 'Light',
    displayName: 'Light',
    data: {
      level: 0,
      school: 'Evocation',
      classes: ['Cleric'],
      text: '',
      rolls: [],
      modifiers: [],
      extra: {},
    },
  },
  {
    ...header,
    id: 'sp2',
    kind: 'spell',
    key: 'sacred flame',
    name: 'Sacred Flame',
    displayName: 'Sacred Flame',
    data: {
      level: 0,
      school: 'Evocation',
      classes: ['Cleric'],
      text: '',
      rolls: [],
      modifiers: [],
      extra: {},
    },
  },
  {
    ...header,
    id: 'sp3',
    kind: 'spell',
    key: 'bless',
    name: 'Bless',
    displayName: 'Bless',
    data: {
      level: 1,
      school: 'Evocation',
      classes: ['Cleric'],
      text: '',
      rolls: [],
      modifiers: [],
      extra: {},
    },
  },
  {
    ...header,
    id: 'sp4',
    kind: 'spell',
    key: 'fireball',
    name: 'Fireball',
    displayName: 'Fireball',
    data: {
      level: 3,
      school: 'Evocation',
      classes: ['Cleric'],
      text: '',
      rolls: [],
      modifiers: [],
      extra: {},
    },
  },
  {
    ...header,
    sourceId: 'srd-2014',
    edition: '2014',
    id: 'lb1',
    kind: 'background',
    key: 'acolyte',
    name: 'Acolyte',
    displayName: 'Acolyte',
    data: {
      proficiency: 'Insight, Religion',
      traits: [
        {
          name: 'Shelter of the Faithful',
          text: 'The faithful give you shelter.',
          category: 'feature',
          rolls: [],
          modifiers: [],
        },
        {
          name: 'Skill Proficiencies',
          text: 'Insight, Religion',
          category: 'skill_proficiency',
          rolls: [],
          modifiers: [],
        },
      ],
      modifiers: [],
      extra: {},
    },
  },
  {
    ...header,
    sourceId: 'srd-2014',
    edition: '2014',
    id: 'ls1',
    kind: 'species',
    key: 'halfling',
    name: 'Halfling',
    displayName: 'Halfling',
    data: {
      spells: [],
      traits: [
        { name: 'Speed', text: 'Your base walking speed is 25 feet.', rolls: [], modifiers: [] },
        { name: 'Size', text: 'Your size is Small.', rolls: [], modifiers: [] },
        { name: 'Lucky', text: 'Reroll a 1.', rolls: [], modifiers: [] },
      ],
      extra: {},
    },
  },
  {
    ...header,
    id: 'f2',
    kind: 'feat',
    key: 'alert',
    name: 'Alert',
    displayName: 'Alert',
    data: { text: 'A bonus to Initiative.', rolls: [], modifiers: [], extra: {} },
  },
] as unknown as CompendiumRecord[];

beforeEach(() => {
  vi.mocked(window.trifold.compendium.search).mockImplementation(async (q) => ({
    rows: records.filter((r) => r.kind === q.kind).map((r) => ({ id: r.id }) as never),
    total: 0,
    tookMs: 0,
  }));
  vi.mocked(window.trifold.compendium.get).mockImplementation(
    async (id) => records.find((r) => r.id === id) ?? null,
  );
});

describe('GuidedBuilder (docs/BUILDER.md)', () => {
  it('walks class, origin and ability scores to a sheet, writing nothing before Finish', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<GuidedBuilder name="Wren" onCancel={() => undefined} onFinish={onFinish} />);

    // Class: the class and its two skills, then Next.
    await user.click(await screen.findByRole('radio', { name: /Cleric/ }));
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Insight' }));
    await user.click(screen.getByRole('checkbox', { name: 'Medicine' }));
    expect(screen.getByRole('checkbox', { name: 'Religion' })).toBeDisabled();
    await user.click(next);

    // Origin.
    await user.click(screen.getByRole('radio', { name: /Sage/ }));
    await user.click(screen.getByRole('radio', { name: /Dwarf/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Ability scores: the standard array, each value once, then the background's increase.
    const scores = within(screen.getByTestId('builder-abilities'));
    const assign: Array<[string, string]> = [
      ['Wisdom', '15'],
      ['Constitution', '14'],
      ['Dexterity', '13'],
      ['Charisma', '12'],
      ['Strength', '10'],
      ['Intelligence', '8'],
    ];
    for (const [ability, value] of assign) {
      const select = scores.getByRole('combobox', { name: ability });
      const option = [...select.querySelectorAll('option')].find(
        (o) => o.textContent === value && !o.disabled,
      )!;
      await user.selectOptions(select, option);
    }
    await user.selectOptions(scores.getByRole('combobox', { name: 'Plus 2' }), 'wis');
    await user.selectOptions(scores.getByRole('combobox', { name: 'Plus 1' }), 'con');
    expect(screen.getByTestId('final-scores')).toHaveTextContent('WIS 17 (+3)');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Equipment: option A until another is picked; B is its worth in gold.
    const kits = screen.getByTestId('builder-equipment');
    expect(within(kits).getByTestId('kit-summary')).toHaveTextContent('7 GP');
    await user.click(within(kits).getAllByRole('radio', { name: /Option B/ })[0]!);
    expect(within(kits).getByTestId('kit-summary')).toHaveTextContent('110 GP');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Spells: one cantrip and one prepared spell, from the class's list at its slot levels.
    const spells = within(screen.getByTestId('builder-spells'));
    expect(spells.queryByRole('checkbox', { name: 'Fireball' })).toBeNull();
    await user.click(spells.getByRole('checkbox', { name: 'Light' }));
    expect(spells.getByRole('checkbox', { name: 'Sacred Flame' })).toBeDisabled();
    await user.click(spells.getByRole('checkbox', { name: 'Bless' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Review: the sheet as it will be.
    const review = screen.getByTestId('builder-review');
    expect(review).toHaveTextContent('Wren');
    expect(review).toHaveTextContent('Cleric 1');
    expect(onFinish).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    const [sheet, build] = onFinish.mock.calls[0]! as [Sheet, unknown];
    expect(sheet.abilities).toMatchObject({ wis: 17, con: 15, int: 8 });
    expect(sheet.maxHp).toBe(10);
    expect(sheet.skills).toEqual({
      arcana: 'proficient',
      history: 'proficient',
      insight: 'proficient',
      medicine: 'proficient',
    });
    expect(sheet.features.find((f) => f.from === 'Sage')?.text).toBe('You learn two cantrips.');
    expect(sheet.gp).toBe(110);
    expect(sheet.slots).toEqual([2]);
    expect(sheet.spells.map((sp) => [sp.name, sp.level, sp.prepared])).toEqual([
      ['Light', 0, false],
      ['Bless', 1, true],
    ]);
    expect(build).toMatchObject({
      abilityMethod: 'standard',
      classSkills: ['insight', 'medicine'],
    });
  });

  it('counts point buy, and rolls scores to assign', async () => {
    const user = userEvent.setup();
    render(<GuidedBuilder name="Wren" onCancel={() => undefined} onFinish={() => undefined} />);
    await user.click(await screen.findByRole('radio', { name: /Cleric/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Insight' }));
    await user.click(screen.getByRole('checkbox', { name: 'Medicine' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: /Sage/ }));
    await user.click(screen.getByRole('radio', { name: /Dwarf/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Point buy' }));
    expect(screen.getByRole('status')).toHaveTextContent('27 of 27 points left');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Wisdom' }), '15');
    expect(screen.getByRole('status')).toHaveTextContent('18 of 27 points left');
    await user.click(screen.getByRole('radio', { name: 'Roll' }));
    await user.click(screen.getByRole('button', { name: 'Roll six scores' }));
    await waitFor(() =>
      expect(screen.getByTestId('rolled-scores').textContent).toMatch(/\(\d, \d, \d, \d\)/),
    );
  });

  it('offers legacy backgrounds and species, used the 2024 way', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<GuidedBuilder name="Pip" onCancel={() => undefined} onFinish={onFinish} />);
    await user.click(await screen.findByRole('radio', { name: /Cleric/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Insight' }));
    await user.click(screen.getByRole('checkbox', { name: 'Medicine' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('radio', { name: /Halfling/ })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /Include legacy/ }));
    await user.click(screen.getByRole('radio', { name: /Acolyte legacy/ }));
    await user.click(screen.getByRole('radio', { name: /Halfling legacy/ }));
    // A legacy background asks for an origin feat.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Origin feat' }), 'alert');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const scores = within(screen.getByTestId('builder-abilities'));
    for (const [ability, value] of [
      ['Wisdom', '15'],
      ['Constitution', '14'],
      ['Dexterity', '13'],
      ['Charisma', '12'],
      ['Strength', '10'],
      ['Intelligence', '8'],
    ] as const) {
      const select = scores.getByRole('combobox', { name: ability });
      const option = [...select.querySelectorAll('option')].find(
        (o) => o.textContent === value && !o.disabled,
      )!;
      await user.selectOptions(select, option);
    }
    // Any three abilities for +1 each.
    await user.click(scores.getByRole('radio', { name: '+1 to all three' }));
    await user.click(scores.getByRole('checkbox', { name: 'Plus 1 to Wisdom' }));
    await user.click(scores.getByRole('checkbox', { name: 'Plus 1 to Dexterity' }));
    await user.click(scores.getByRole('checkbox', { name: 'Plus 1 to Charisma' }));
    expect(scores.getByRole('checkbox', { name: 'Plus 1 to Strength' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    const [sheet] = onFinish.mock.calls[0]! as [Sheet];
    expect(sheet.abilities).toMatchObject({ wis: 16, dex: 14, cha: 13 });
    expect(sheet.speed).toBe(25);
    expect(sheet.features.filter((f) => f.from === 'Acolyte').map((f) => f.name)).toEqual([
      'Alert',
      'Shelter of the Faithful',
    ]);
  });

  it('says so when the 2024 SRD is switched off', async () => {
    vi.mocked(window.trifold.compendium.search).mockResolvedValue({
      rows: [],
      total: 0,
      tookMs: 0,
    } as never);
    render(<GuidedBuilder name="Wren" onCancel={() => undefined} onFinish={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('switched off or missing');
  });
});
