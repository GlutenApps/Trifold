import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JoinedSummary } from '@trifold/api';
import type { Note, PinnedRoll } from '@trifold/schema';
import { homeOf, useNavStore } from '../../navigate';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { usePinnedRollsStore } from '../../stores/pinnedRollsStore';
import { useRollLogStore } from '../../stores/rollLogStore';
import { useSearchStore } from '../../stores/searchStore';
import { useShellStore } from '../../stores/shellStore';
import { logTableRoll, useTableRollStore } from '../../stores/tableRollStore';
import { QuickNotesTool } from '../campaign/QuickNotesTool';
import { DiceRoller } from '../dice/DiceRoller';

/**
 * Quick notes and Dice in a player console (docs/PLAYER-MODE.md, "Panels"): the GM's own tools,
 * reading and writing the player's files in the joined campaign and never a GM campaign's.
 */
const campaign: JoinedSummary = {
  campaignId: 'c1',
  campaignName: 'Greyford',
  displayName: 'Sam',
  characterId: null,
  joinedAt: '2026-11-23T18:00:00.000Z',
  lastLiveAt: null,
  openedAt: null,
  claimed: true,
};

const note = (id: string, title: string, at: string): Note => ({
  schemaVersion: 1,
  id,
  kind: 'note',
  title,
  body: '',
  tags: [],
  links: [],
  parentId: null,
  order: 0,
  capture: { at },
  createdAt: at,
  updatedAt: at,
});

const older = note('a', 'The ferryman', '2026-01-23T18:00:00.000Z');
const newer = note('b', 'Owes us a favour', '2026-01-23T19:00:00.000Z');

async function open(notes: Note[] = [], pins: PinnedRoll[] = []) {
  vi.mocked(window.trifold.joined.notes).mockResolvedValue(notes);
  vi.mocked(window.trifold.joined.pinnedRolls).mockResolvedValue(pins);
  useJoinedStore.setState({ joined: [campaign] });
  await useJoinedStore.getState().openCampaign('c1');
}

beforeEach(() => {
  useCampaignStore.setState({ current: null });
  useJoinedStore.setState({ joined: [], current: null, notes: [], pins: [] });
  useShellStore.getState().leaveCampaign();
  useAppStore.setState({ error: null });
  useRollLogStore.getState().clear();
  usePinnedRollsStore.setState({ fromLog: {}, naming: null, error: null });
  useTableRollStore.setState({ mode: 'table', send: null });
  for (const fn of Object.values(window.trifold.joined)) vi.mocked(fn).mockClear();
  vi.mocked(window.trifold.notes.capture).mockClear();
  vi.mocked(window.trifold.notes.save).mockClear();
  vi.mocked(window.trifold.pinnedRolls.save).mockClear();
});

describe('Quick notes in a player console', () => {
  it('lists the player’s own notes, newest first, with no folders to move into', async () => {
    await open([newer, older]);
    render(<QuickNotesTool />);
    expect(screen.getAllByTestId('quick-note-row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Owes us a favour'),
      expect.stringContaining('The ferryman'),
    ]);
    await userEvent.click(screen.getAllByTestId('quick-note-row')[1]!);
    const pane = screen.getByTestId('note-pane');
    expect(within(pane).getByLabelText('Title')).toHaveValue('The ferryman');
    expect(within(pane).queryByLabelText('Move to folder')).toBeNull();
    expect(within(pane).queryByRole('button', { name: /in Notes$/ })).toBeNull();
  });

  it('saves a capture into the joined campaign, and never through the GM’s notes', async () => {
    await open([older]);
    render(<QuickNotesTool />);
    await userEvent.type(screen.getByLabelText('Quick note title'), 'Bridge is out');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getAllByTestId('quick-note-row')).toHaveLength(2));
    expect(window.trifold.joined.saveNote).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ id: '', title: 'Bridge is out', parentId: null }),
    );
    expect(window.trifold.notes.capture).not.toHaveBeenCalled();
    expect(window.trifold.notes.save).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('quick-note-row')[0]).toHaveTextContent('Bridge is out');
  });

  it('deletes an open note after the inline confirm', async () => {
    await open([older]);
    render(<QuickNotesTool />);
    await userEvent.click(screen.getByTestId('quick-note-row'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete The ferryman' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('note-pane')).toBeNull());
    expect(window.trifold.joined.removeNote).toHaveBeenCalledWith('c1', 'a');
    expect(screen.queryByTestId('quick-note-row')).toBeNull();
  });

  it('shows a failed save in the console’s banner', async () => {
    await open();
    vi.mocked(window.trifold.joined.saveNote).mockRejectedValueOnce(new Error('Disk is full'));
    render(<QuickNotesTool />);
    await userEvent.type(screen.getByLabelText('Quick note title'), 'Lost');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useAppStore.getState().error).toBe('Disk is full'));
    // The draft is still there to try again.
    expect(screen.getByLabelText('Quick note title')).toHaveValue('Lost');
  });

  it('forgets the notes when the campaign closes', async () => {
    await open([older]);
    useJoinedStore.getState().closeCampaign();
    expect(useJoinedStore.getState().notes).toEqual([]);
    render(<QuickNotesTool />);
    expect(screen.getByText('Open a campaign first.')).toBeInTheDocument();
  });
});

describe('Dice in a player console', () => {
  const roll = () =>
    useRollLogStore.getState().add({
      kind: 'dice',
      label: '2d6+1',
      expression: '2d6+1',
      total: 9,
      faces: '2d6: 5, 3',
      source: 'pool',
    });

  it('pins a roll into the joined campaign, renames it and unpins it', async () => {
    await open();
    roll();
    render(<DiceRoller />);
    await userEvent.click(screen.getByRole('button', { name: 'Pin 2d6+1' }));
    const pinned = await screen.findByRole('list', { name: 'Pinned rolls' });
    const name = within(pinned).getByRole('textbox', { name: 'Name for the pinned 2d6+1 roll' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Greatsword{Enter}');
    expect(within(pinned).getByText('Greatsword')).toBeInTheDocument();
    expect(window.trifold.joined.savePinnedRoll).toHaveBeenLastCalledWith(
      'c1',
      expect.objectContaining({ id: 'pin-new', name: 'Greatsword', total: 9 }),
    );
    expect(window.trifold.pinnedRolls.save).not.toHaveBeenCalled();
    expect(useJoinedStore.getState().pins.map((p) => p.name)).toEqual(['Greatsword']);

    await userEvent.click(screen.getByRole('button', { name: 'Unpin Greatsword' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Unpin Greatsword?' })).getByRole('button', {
        name: 'Unpin',
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('pinned-roll')).toBeNull());
    expect(window.trifold.joined.removePinnedRoll).toHaveBeenCalledWith('c1', 'pin-new');
  });

  it('shows the pins the campaign already had, and offers no pin with no campaign open', async () => {
    roll();
    const { unmount } = render(<DiceRoller />);
    expect(screen.getByRole('button', { name: 'Pin 2d6+1' })).toBeDisabled();
    unmount();
    await open(
      [],
      [
        {
          schemaVersion: 1,
          id: 'p1',
          name: 'Stealth',
          label: '1d20+5',
          expression: '1d20+5',
          total: 17,
          faces: '1d20: 12',
          kind: 'dice',
          source: 'pool',
          rolledAt: '2026-11-23T18:00:00.000Z',
          createdAt: '2026-11-23T18:00:00.000Z',
          updatedAt: '2026-11-23T18:00:00.000Z',
        },
      ],
    );
    render(<DiceRoller />);
    expect(screen.getByTestId('pinned-roll')).toHaveTextContent('Stealth');
    expect(screen.getByRole('button', { name: 'Pin 2d6+1' })).toBeEnabled();
  });
});

describe('Search in a player console', () => {
  const groups = () =>
    useSearchStore
      .getState()
      .groups()
      .map((g) => [g.label, g.results.map((r) => r.title)]);

  beforeEach(() => {
    useSearchStore.getState().clear();
    useNavStore.setState({ pending: null });
  });

  it('finds the player’s notes by title and by text, and nothing of a GM’s campaign', async () => {
    await open([{ ...older, body: 'He **owes** the harbourmaster.' }, newer]);
    useSearchStore.getState().setQuery('ferryman');
    expect(groups()).toEqual([['Notes', ['The ferryman']]]);
    useSearchStore.getState().setQuery('owes');
    expect(groups()).toEqual([
      ['Notes', ['Owes us a favour']],
      ['Mentioned in', ['The ferryman']],
    ]);

    // A note saved while the list is open shows at once.
    await useJoinedStore.getState().captureNote('Who owes whom', '');
    expect(groups()[0]).toEqual(['Notes', ['Owes us a favour', 'Who owes whom']]);

    // Closing the campaign starts clean.
    useJoinedStore.getState().closeCampaign();
    expect(useSearchStore.getState().query).toBe('');
  });

  it('opens a found note in Quick notes, at the phrase', async () => {
    await open([{ ...older, body: 'He owes the harbourmaster.' }]);
    expect(homeOf({ type: 'note', id: 'a' }, 'player')).toEqual({ tool: 'quickNotes' });
    expect(homeOf({ type: 'note', id: 'a' })).toEqual({ tab: 'campaign' });
    expect(homeOf({ type: 'record', id: 'r' }, 'player')).toEqual({ tab: 'compendium' });

    render(<QuickNotesTool />);
    useSearchStore.getState().setQuery('harbourmaster');
    expect(useSearchStore.getState().activate()).toBe(true);
    const pane = await screen.findByTestId('note-pane');
    expect(within(pane).getByLabelText('Title')).toHaveValue('The ferryman');
    await waitFor(() => expect(useNavStore.getState().pending).toBeNull());
    expect(
      useShellStore.getState().layout.dock.sections.find((s) => s.tool === 'quickNotes')?.open,
    ).toBe(true);
  });
});

describe('Table and Private rolls in a player console', () => {
  const entries = () => useRollLogStore.getState().entries;

  it('asks the table for a roll and logs it only when the table sends it back', async () => {
    await open();
    const send = vi.fn();
    useTableRollStore.getState().setSend(send);
    render(<DiceRoller />);
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('table-roll-switch')).toHaveTextContent(
      'Rolled on your GM’s computer. Everyone at the table sees it.',
    );

    await userEvent.type(screen.getByLabelText('Dice expression'), 'd20+5 adv{Enter}');
    expect(send).toHaveBeenCalledWith('d20+5 adv');
    // Nothing is rolled here: the result is the table's to make.
    expect(entries()).toEqual([]);

    logTableRoll({
      id: 'table-1',
      at: 1,
      by: 'Brannoc',
      label: 'd20+5 (advantage)',
      expression: 'd20+5',
      total: 25,
      faces: '1d20: 20, 4 → 20',
      outcome: 'crit',
    });
    expect(entries()[0]).toMatchObject({
      source: 'table',
      actor: 'Brannoc',
      total: 25,
      outcome: 'crit',
    });
    const latest = await screen.findByTestId('latest-roll');
    expect(latest).toHaveTextContent('table');
    expect(latest).toHaveTextContent('Brannoc');

    // What the table would refuse is caught before it is sent.
    await userEvent.type(screen.getByLabelText('Dice expression'), `1d6${'+1'.repeat(40)}{Enter}`);
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByText('That roll is too long for the table.')).toBeInTheDocument();
  });

  it('rolls here and sends nothing when the player chooses Private', async () => {
    await open();
    const send = vi.fn();
    useTableRollStore.getState().setSend(send);
    render(<DiceRoller />);
    await userEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(screen.getByTestId('table-roll-switch')).toHaveTextContent(
      'Rolled here. Nobody else sees it.',
    );
    await userEvent.type(screen.getByLabelText('Dice expression'), '2d6+1{Enter}');
    expect(send).not.toHaveBeenCalled();
    expect(entries()[0]).toMatchObject({ source: 'pool', expression: '2d6+1' });
  });

  it('makes every roll private away from the table, and says so', async () => {
    await open();
    render(<DiceRoller />);
    expect(screen.getByRole('button', { name: 'Table' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('table-roll-switch')).toHaveTextContent(
      'You are not at the table with a character, so every roll is private.',
    );
    await userEvent.type(screen.getByLabelText('Dice expression'), '1d4{Enter}');
    expect(entries()[0]).toMatchObject({ source: 'pool' });
  });

  it('offers no switch in the GM’s console, whose rolls are the GM’s own', () => {
    render(<DiceRoller />);
    expect(screen.queryByTestId('table-roll-switch')).toBeNull();
  });
});
