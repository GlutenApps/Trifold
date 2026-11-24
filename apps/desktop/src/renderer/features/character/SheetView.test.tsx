import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { Character, Sheet } from '@trifold/schema';
import { useRollLogStore } from '../../stores/rollLogStore';
import { SheetView } from './SheetView';

/** The character sheet's layout (ADR 0080): tabs, pips, slots by spell level, the readout. */

const now = '2026-11-24T00:00:00.000Z';

const cleric: Character = {
  schemaVersion: 1,
  id: 'K9',
  name: 'Maren',
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
  sheet: {
    ...blankSheet(),
    species: 'Dwarf',
    background: 'Acolyte',
    classes: [{ name: 'Cleric', subclass: 'Life Domain', level: 5 }],
    abilities: { str: 14, dex: 10, con: 14, int: 8, wis: 18, cha: 12 },
    saves: ['wis', 'cha'],
    skills: { medicine: 'proficient', religion: 'expertise' },
    spellcastingAbility: 'wis',
    slots: [4, 2],
    slotsUsed: [1],
    maxHp: 43,
    attacks: [
      {
        id: 'a1',
        name: 'Mace',
        ability: 'str',
        proficient: true,
        bonus: 0,
        damage: '1d6 bludgeoning',
      },
    ],
    features: [
      {
        id: 'f1',
        name: 'Channel Divinity',
        from: 'Cleric 2',
        text: 'Turn undead, or call on the domain.',
        uses: { max: 2, used: 1, reset: 'short' },
      },
    ],
    spells: [
      { id: 's1', name: 'Sacred Flame', level: 0, prepared: false },
      { id: 's2', name: 'Bless', level: 1, prepared: true },
      { id: 's3', name: 'Shield of Faith', level: 1, prepared: false },
      { id: 's4', name: 'Aid', level: 2, prepared: true },
    ],
    equipment: [
      { id: 'e1', name: 'Bolts', quantity: 20 },
      { id: 'e2', name: 'Holy Symbol', quantity: 1 },
    ],
    gp: 47,
  },
  notes: 'Owes the ferryman a favour.',
  createdAt: now,
  updatedAt: now,
};

/** The sheet with rolling and resources on, its sheet kept in state as the store keeps it. */
function AtTheTable({ seen }: { seen?(s: Sheet): void }) {
  const [character, setCharacter] = useState(cleric);
  return (
    <SheetView
      character={character}
      onEdit={() => undefined}
      rolls={{ actor: 'Maren' }}
      resources={{
        onChange: (sheet) => {
          setCharacter((c) => ({ ...c, sheet }));
          seen?.(sheet);
        },
      }}
    />
  );
}

beforeEach(() => {
  useRollLogStore.setState({ entries: [] } as never);
});

describe('the sheet’s tabs', () => {
  it('uses the app’s sub-tabs, with a tab only for what the sheet holds', async () => {
    const user = userEvent.setup();
    render(<SheetView character={cleric} />);
    const tabs = within(screen.getByRole('tablist', { name: 'Sheet sections' }));
    // A narrow sheet (and the test's, which has no width) keeps abilities in a tab.
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Actions',
      'Spells',
      'Abilities',
      'Features',
      'Equipment',
      'Notes',
    ]);
    expect(tabs.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true');
    expect(tabs.getByRole('tab', { name: 'Actions' })).toHaveClass('subtab', 'active');
    await user.click(tabs.getByRole('tab', { name: 'Spells' }));
    expect(tabs.getByRole('tab', { name: 'Spells' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Spells' })).toHaveClass('on');
    expect(screen.getByRole('tabpanel', { name: 'Actions' })).not.toHaveClass('on');
  });

  it('leaves out tabs a blank sheet has nothing for, and says what to add', () => {
    render(
      <SheetView
        character={{ ...cleric, notes: '', sheet: blankSheet() }}
        onEdit={() => undefined}
      />,
    );
    const tabs = within(screen.getByRole('tablist', { name: 'Sheet sections' }));
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Actions', 'Abilities']);
    expect(screen.getByText('No attacks, spells, features or equipment yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add in Edit' })).toBeInTheDocument();
  });
});

describe('what can be pressed (ADR 0080)', () => {
  it('draws a read-only sheet with nothing pressable: plain numbers, inert pips, no turn bar', () => {
    render(<SheetView character={cleric} />);
    expect(screen.queryByRole('button', { name: /^Roll / })).toBeNull();
    expect(screen.queryByRole('button', { name: /available|used/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 1 slot: 3 of 4 left' })).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-last-roll')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cast / })).toBeNull();
  });

  it('makes rollable numbers buttons, and only the Initiative tile among the four', () => {
    render(<AtTheTable />);
    const numbers = within(screen.getByLabelText('Numbers'));
    expect(numbers.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Roll Initiative',
    ]);
    expect(screen.getByRole('button', { name: 'Roll Wisdom save' })).toHaveTextContent('+7');
    expect(screen.getByRole('button', { name: 'Roll Mace damage' })).toHaveTextContent('1d6');
    // Proficiency is a diamond with a title, not a pip.
    expect(screen.getByTitle('Expertise')).toHaveClass('sh-prof');
  });

  it('only lets a row light up when it opens or acts', () => {
    render(<AtTheTable />);
    const bolts = screen.getByText('Bolts').closest('.sh-row')!;
    expect(bolts).not.toHaveClass('acts');
    const channel = screen.getByRole('button', { name: 'Channel Divinity' }).closest('.sh-row')!;
    expect(channel).toHaveClass('acts');
  });
});

describe('spells', () => {
  it('groups spells by level, each with its own slots, prepared first', () => {
    render(<AtTheTable />);
    const one = within(screen.getByTestId('spell-level-1'));
    expect(one.getByText('3 of 4 slots')).toBeInTheDocument();
    expect(one.getAllByText(/^(Bless|Shield of Faith)$/).map((e) => e.textContent)).toEqual([
      'Bless',
      'Shield of Faith',
    ]);
    expect(one.getByText('not prepared')).toBeInTheDocument();
    // Cantrips are always ready, whatever the flag says.
    const cantrips = within(screen.getByTestId('spell-level-0'));
    expect(cantrips.getByText('At will')).toBeInTheDocument();
    expect(cantrips.queryByText('not prepared')).toBeNull();
  });

  it('casts with a slot of the spell’s level, says so, and undoes it', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} />);
    expect(
      screen.getByRole('button', { name: 'Cast Shield of Faith with a level 1 slot' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cast Bless with a level 1 slot' }));
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([2]);
    const readout = screen.getByTestId('sheet-last-roll');
    expect(readout).toHaveTextContent('Bless');
    expect(readout).toHaveTextContent('cast with a level 1 slot, 2 left');
    await user.click(within(readout).getByRole('button', { name: 'Undo' }));
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([1]);
    expect(
      within(screen.getByTestId('spell-level-1')).getByText('3 of 4 slots'),
    ).toBeInTheDocument();
  });

  it('hides unprepared spells on request and says how many', async () => {
    const user = userEvent.setup();
    render(<AtTheTable />);
    await user.click(screen.getByRole('button', { name: 'Show prepared spells only' }));
    const one = within(screen.getByTestId('spell-level-1'));
    expect(one.queryByText('Shield of Faith')).toBeNull();
    expect(one.getByText('1 more not prepared')).toBeInTheDocument();
  });
});

describe('the turn bar', () => {
  it('shows the last roll in one line, and the roll mode goes back to normal after it', async () => {
    const user = userEvent.setup();
    render(<AtTheTable />);
    expect(screen.getByTestId('sheet-last-roll')).toHaveTextContent('No rolls yet');
    await user.click(screen.getByRole('button', { name: 'Advantage' }));
    await user.click(screen.getByRole('button', { name: 'Roll Medicine check' }));
    const readout = screen.getByTestId('sheet-last-roll');
    expect(readout).toHaveTextContent('Medicine check');
    expect(readout).toHaveTextContent('1d20+7');
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  });
});
