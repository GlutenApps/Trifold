import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientView, CreatureView, JoinedSummary } from '@trifold/api';
import { blankSheet } from '@trifold/rules';
import type { Character } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { useShellStore } from '../../stores/shellStore';
import { MyCharactersTool } from './MyCharactersTool';
import { PlayerTableProvider } from './PlayerTable';
import { SheetsPage } from './SheetsPage';
import { TablePage } from './TablePage';

const now = '2026-11-23T00:00:00.000Z';
const campaign = (characterId: string | null = null): JoinedSummary => ({
  campaignId: 'c1',
  campaignName: 'Greyford',
  displayName: 'Sam',
  characterId,
  joinedAt: now,
  lastLiveAt: null,
  claimed: true,
});

const bren: Character = {
  schemaVersion: 1,
  id: 'K1',
  name: 'Bren',
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
    classes: [{ name: 'Rogue', subclass: '', level: 3 }],
    abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 12, cha: 10 },
    skills: { stealth: 'expertise' },
    attacks: [
      { id: 'a', name: 'Rapier', ability: 'dex', proficient: true, bonus: 0, damage: '1d8+3' },
    ],
  },
  sheetUrl: 'https://example.test/bren',
  notes: '',
  createdAt: now,
  updatedAt: now,
};

const creature = (extra: Partial<CreatureView> = {}): CreatureView => ({
  kind: 'pc',
  id: 'p1',
  name: 'Brannoc',
  hp: { current: 20, max: 24, temp: 0 },
  ac: 16,
  conditions: [],
  inFight: false,
  needsInitiative: false,
  editable: { hp: true, maxHp: true, ac: true, conditions: true },
  movementLocked: false,
  ...extra,
});

const view = (mine: CreatureView[]): ClientView => ({
  campaignName: 'Greyford',
  live: true,
  mine,
  picker: [],
  map: null,
  reclaimMode: 'open',
});

let table: { link(link: string): void; state(v: ClientView): void };

beforeEach(() => {
  const listeners = new Map<string, (payload: never) => void>();
  window.trifold.on = vi.fn((event: string, listener: (payload: never) => void) => {
    listeners.set(event, listener);
    return () => undefined;
  }) as never;
  window.trifold.joined.send = vi.fn(async () => undefined);
  vi.mocked(window.trifold.joined.lastView).mockResolvedValue(null);
  vi.mocked(window.trifold.characters.list).mockResolvedValue([bren]);
  vi.mocked(window.trifold.joined.linkCharacter).mockClear();
  useCharacterStore.setState({
    characters: [],
    loaded: false,
    openId: null,
    editingSheet: false,
    error: null,
  });
  useJoinedStore.setState({ current: campaign(), joined: [campaign()] });
  table = {
    link: (link) =>
      act(() => (listeners.get('joinedLink') as (e: object) => void)({ campaignId: 'c1', link })),
    state: (v) =>
      act(() =>
        (listeners.get('joinedMessage') as (e: object) => void)({
          campaignId: 'c1',
          message: { type: 'state', ...v },
        }),
      ),
  };
});

function mount(node: React.ReactNode, v?: ClientView) {
  render(
    <PlayerTableProvider campaign={useJoinedStore.getState().current!}>{node}</PlayerTableProvider>,
  );
  if (v) {
    table.link('open');
    table.state(v);
  }
}

describe('Sheets (ADR 0069)', () => {
  it('points to My characters when none is linked, and shows one once it is', async () => {
    mount(<SheetsPage />);
    expect(await screen.findByText(/No character is linked/)).toHaveTextContent(
      'under My characters',
    );
    // Linking lives in My characters, not here too.
    expect(screen.queryByRole('combobox', { name: 'Link a character' })).toBeNull();
    await act(() => useJoinedStore.getState().linkCharacter('K1'));
    expect(window.trifold.joined.linkCharacter).toHaveBeenCalledWith('c1', 'K1');
    expect(await screen.findByTestId('sheet-view')).toHaveTextContent('Bren');
  });

  it('shows the linked sheet worked out, with the table’s live HP above it', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    mount(<SheetsPage />, view([creature()]));
    const sheet = await screen.findByTestId('sheet-view');
    expect(sheet).toHaveTextContent('Rogue 3');
    // Dex 16, no armour: AC 13; stealth with expertise at 3rd level: +7.
    expect(within(screen.getByLabelText('Numbers')).getByText('13')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Skills')).getByText('+7')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Attacks')).getByText('+5 to hit')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-live')).toHaveTextContent('20');
  });

  it('opens the sheet link in a web tab, and edits on the sheet itself', async () => {
    const addWebTab = vi.fn();
    useShellStore.setState({ addWebTab } as never);
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(<SheetsPage />);
    await user.click(await screen.findByRole('button', { name: 'Open character sheet' }));
    expect(addWebTab).toHaveBeenCalledWith({
      url: 'https://example.test/bren',
      title: 'Bren’s sheet',
    });
    await user.click(screen.getByRole('button', { name: 'Edit Bren' }));
    expect(screen.getByTestId('trifold-sheet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('sheet-view')).toBeInTheDocument();
  });

  it('switches to a companion, which shows what the table sends of it', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(
      <SheetsPage />,
      view([
        creature(),
        creature({
          kind: 'summon',
          id: 't9',
          name: 'Wolf',
          ac: 13,
          summon: {
            owner: { kind: 'pc', id: 'p1' },
            type: 'Beast',
            persistent: false,
            concentrationLost: false,
          },
        }),
      ]),
    );
    await user.click(await screen.findByRole('tab', { name: 'Wolf' }));
    expect(screen.getByTestId('companion-sheet')).toHaveTextContent('Beast · AC 13');
    await user.click(screen.getByRole('tab', { name: 'Brannoc' }));
    expect(screen.getByTestId('sheet-view')).toBeInTheDocument();
  });
});

describe('My characters and Sheets (ADR 0069)', () => {
  it('opens the sheet from a row, and the pencil opens it to edit', async () => {
    const openMajor = vi.fn();
    useShellStore.setState({ openMajor } as never);
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(<MyCharactersTool />, view([creature()]));
    expect(await screen.findByTestId('character-link')).toHaveTextContent('Your sheet: Bren');
    await user.click(screen.getByRole('button', { name: 'Open Brannoc’s sheet' }));
    expect(openMajor).toHaveBeenLastCalledWith('sheets');
    expect(useCharacterStore.getState().editingSheet).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Edit Brannoc’s sheet' }));
    expect(useCharacterStore.getState().editingSheet).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() =>
      expect(window.trifold.joined.linkCharacter).toHaveBeenCalledWith('c1', null),
    );
  });

  it('makes a new character, links it and opens it to fill in', async () => {
    const openMajor = vi.fn();
    useShellStore.setState({ openMajor } as never);
    vi.mocked(window.trifold.characters.list).mockResolvedValue([]);
    const user = userEvent.setup();
    mount(<MyCharactersTool />, view([creature()]));
    await user.click(await screen.findByRole('button', { name: 'New character' }));
    await user.type(screen.getByRole('textbox', { name: 'Character name' }), 'Wren');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(window.trifold.joined.linkCharacter).toHaveBeenCalled());
    const [, linked] = vi.mocked(window.trifold.joined.linkCharacter).mock.calls[0]!;
    expect(useCharacterStore.getState().characters.find((c) => c.id === linked)?.name).toBe('Wren');
    await waitFor(() => expect(openMajor).toHaveBeenCalledWith('sheets'));
    expect(useCharacterStore.getState().editingSheet).toBe(true);
  });
});

describe('New PC from player sheet, the player’s side (ADR 0072)', () => {
  it('asks the GM to add the linked character while holding nothing', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(<TablePage />, {
      ...view([]),
      picker: [{ kind: 'pc', id: 'p1', name: 'Brannoc', inUse: false, holderOnline: false }],
    });
    await user.click(await screen.findByRole('button', { name: 'Ask your GM to add Bren' }));
    const sent = vi.mocked(window.trifold.joined.send).mock.calls.at(-1)![1];
    expect(sent).toMatchObject({
      type: 'sheetOffer',
      label: 'Sam',
      offer: { name: 'Bren', numbers: { level: 3, ac: 13 }, sheetUrl: 'https://example.test/bren' },
    });
    expect(sent).not.toHaveProperty('creatureId');
  });

  it('offers nothing without a linked character', async () => {
    mount(<TablePage />, {
      ...view([]),
      picker: [{ kind: 'pc', id: 'p1', name: 'Brannoc', inUse: false, holderOnline: false }],
    });
    await screen.findByRole('heading', { name: /Pick your character/ });
    expect(screen.queryByTestId('ask-new-pc')).toBeNull();
  });
});
