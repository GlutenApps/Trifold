import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet, type Character, type CharacterBuild, type CompendiumRecord } from '@trifold/schema';
import { LevelUpPanel } from './LevelUpPanel';

const header = { schemaVersion: 1, sourceId: 'srd-2024', edition: '2024', tags: [] };
const feature = (name: string, text: string) => ({
  name,
  text,
  optional: false,
  rolls: [],
  modifiers: [],
});

/** SRD-text records, as the snapshot holds them. */
const records = [
  {
    ...header,
    id: 'c1',
    kind: 'class',
    key: 'fighter',
    name: 'Fighter',
    displayName: 'Fighter',
    data: {
      hd: 10,
      proficiency: 'Strength, Constitution, Athletics, Perception',
      numSkills: 2,
      levels: [
        {
          level: 3,
          scoreImprovement: false,
          features: [feature('Fighter Subclass', 'You gain a Fighter subclass.')],
          counters: [],
        },
        {
          level: 4,
          scoreImprovement: true,
          features: [feature('Ability Score Improvement', 'You gain the ASI feat.')],
          counters: [],
        },
      ],
      extra: { casterType: ['NONE'], primaryAbility: ['Strength'], equipment: [] },
    },
  },
  {
    ...header,
    id: 'c2',
    kind: 'class',
    key: 'champion',
    name: 'Champion',
    displayName: 'Champion',
    data: {
      levels: [
        {
          level: 3,
          scoreImprovement: false,
          features: [feature('Improved Critical', 'A Critical Hit on a 19 or 20.')],
          counters: [],
        },
      ],
      extra: { subclassOf: ['Fighter'] },
    },
  },
  {
    ...header,
    id: 'f1',
    kind: 'feat',
    key: 'alert',
    name: 'Alert',
    displayName: 'Alert',
    data: { text: 'You gain a bonus to Initiative.', rolls: [], modifiers: [], extra: {} },
  },
] as unknown as CompendiumRecord[];

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
  hitPoints: [7],
  improvements: [],
};
const character = (level: number): Character => ({
  schemaVersion: 1,
  id: 'K1',
  name: 'Tamsin',
  kind: 'trifold',
  edition: '2024',
  numbers: {
    classText: '',
    level: 1,
    maxHp: 10,
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    passives: { perception: 10, insight: 10, investigation: 10 },
    saves: {},
  },
  sheet: Sheet.parse({
    classes: [{ name: 'Fighter', level }],
    abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
    maxHp: 19,
  }),
  build,
  notes: '',
  createdAt: '2026-11-23T00:00:00.000Z',
  updatedAt: '2026-11-23T00:00:00.000Z',
});

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

describe('Level up (docs/BUILDER.md)', () => {
  it('takes the subclass at its level, with fixed hit points', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<LevelUpPanel character={character(2)} onApply={onApply} onClose={() => undefined} />);
    expect(await screen.findByText('Level up to Fighter 3')).toBeInTheDocument();
    // d10 fixed is 6, plus Con +2.
    expect(screen.getByTestId('levelup-hp')).toHaveTextContent('+8 HP, 27 in all');
    const apply = screen.getByRole('button', { name: 'Level up' });
    expect(apply).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Subclass' }), 'champion');
    expect(screen.getByText(/New features: Improved Critical/)).toBeInTheDocument();
    await user.click(apply);
    const [sheet, next] = onApply.mock.calls[0]! as [Sheet, CharacterBuild];
    expect(sheet.classes[0]).toMatchObject({ level: 3, subclass: 'Champion' });
    expect(sheet.maxHp).toBe(27);
    expect(next.hitPoints).toEqual([7, 8]);
  });

  it('asks for an improvement or a feat at an ASI level', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<LevelUpPanel character={character(3)} onApply={onApply} onClose={() => undefined} />);
    await screen.findByText('Level up to Fighter 4');
    const apply = screen.getByRole('button', { name: 'Level up' });
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'A feat' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Feat' }), 'alert');
    await user.click(apply);
    const [sheet] = onApply.mock.calls[0]! as [Sheet];
    expect(sheet.features.map((f) => f.name)).toEqual(['Alert']);
  });

  it('rolls hit points when asked', async () => {
    const user = userEvent.setup();
    render(
      <LevelUpPanel character={character(3)} onApply={() => undefined} onClose={() => undefined} />,
    );
    await screen.findByText('Level up to Fighter 4');
    await user.click(screen.getByRole('radio', { name: /Roll d10/ }));
    expect(screen.queryByTestId('levelup-hp')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Roll' }));
    expect(screen.getByTestId('levelup-hp')).toHaveTextContent(/^\+\d+ HP/);
  });
});
