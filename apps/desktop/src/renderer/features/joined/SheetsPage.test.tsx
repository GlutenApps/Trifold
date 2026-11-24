import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientView, CreatureView, JoinedSummary } from '@trifold/api';
import { blankSheet } from '@trifold/rules';
import { parseCompendiumXml } from '@trifold/importers';
import type { Character } from '@trifold/schema';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { useCharacterStore } from '../../stores/characterStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { useShellStore } from '../../stores/shellStore';
import { MyCharactersTool } from './MyCharactersTool';
import { PlayerTableProvider } from './PlayerTable';
import { SheetsPage } from './SheetsPage';
import { FormToggle } from '../character/Forms';
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
    expect(screen.getByLabelText('Attacks')).toHaveTextContent('+5 to hit');
    expect(screen.getByTestId('sheet-live')).toHaveTextContent('20');
  });

  it('rolls from the sheet at the table, saying what the roll is for (ADR 0075)', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(<SheetsPage />, view([creature()]));
    await screen.findByTestId('sheet-view');
    await user.click(screen.getByRole('radio', { name: 'Advantage' }));
    await user.click(screen.getByRole('button', { name: 'Roll Stealth check' }));
    expect(window.trifold.joined.send).toHaveBeenLastCalledWith('c1', {
      type: 'roll',
      expression: '1d20+7 adv',
      for: 'Stealth check',
    });
    // Advantage was for that roll only.
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Roll Rapier damage' }));
    expect(window.trifold.joined.send).toHaveBeenLastCalledWith('c1', {
      type: 'roll',
      expression: '1d8+3',
      for: 'Rapier damage',
    });
  });

  it('enters an initiative roll at the table while the fight waits for it', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(<SheetsPage />, view([creature({ inFight: true, needsInitiative: true })]));
    await screen.findByTestId('sheet-view');
    await user.click(screen.getByRole('button', { name: 'Roll Initiative' }));
    expect(window.trifold.joined.send).toHaveBeenLastCalledWith('c1', {
      type: 'roll',
      expression: '1d20+3',
      for: 'Initiative',
      initiative: { creatureKind: 'pc', creatureId: 'p1' },
    });
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

  it('shows a companion’s stat block from what the GM shared, under its live numbers', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    // An SRD stat block, read from the compendium fixture, as the GM's shared copy.
    const shrub = parseCompendiumXml(fixture, {
      sourceId: 'src',
      defaultEdition: '2014',
    }).records.find((r) => r.name === 'Awakened Shrub')!;
    const shared = { ...shrub, id: 'shared:c1:hb-shrub', sourceId: 'shared:c1' };
    vi.mocked(window.trifold.compendium.get).mockImplementation(async (id) =>
      id === 'shared:c1:hb-shrub' ? (shared as never) : null,
    );
    const user = userEvent.setup();
    mount(
      <SheetsPage />,
      view([
        creature(),
        creature({
          kind: 'npc',
          id: 'n-shrub',
          name: 'Bramble',
          ac: 11,
          companionOf: 'p1',
          statBlock: { recordId: 'hb-shrub', key: 'awakened shrub' },
        }),
        creature({
          kind: 'npc',
          id: 'n-cat',
          name: 'Whiskers',
          ac: 12,
          companionOf: 'p1',
          statBlock: { recordId: 'hb-cat', key: 'cat' },
        }),
      ]),
    );
    await user.click(await screen.findByRole('tab', { name: 'Bramble' }));
    expect(await screen.findByTestId('companion-statblock')).toHaveTextContent('False Appearance');
    expect(screen.getByTestId('sheet-live')).toBeInTheDocument();
    // One the player's Trifold does not have yet says so.
    await user.click(screen.getByRole('tab', { name: 'Whiskers' }));
    expect(
      await screen.findByText(/Its stat block is not on this computer yet/),
    ).toBeInTheDocument();
    expect(window.trifold.compendium.findByKey).toHaveBeenCalledWith('monster', 'cat');
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
    await user.click(screen.getByRole('radio', { name: /Blank sheet/ }));
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

describe('Forms', () => {
  const shrub = () =>
    parseCompendiumXml(fixture, { sourceId: 'srd-2024', defaultEdition: '2014' }).records.find(
      (r) => r.name === 'Awakened Shrub',
    )!;

  it('shows a pinned form as a tab, its stat block under the character’s own live numbers', async () => {
    vi.mocked(window.trifold.characters.list).mockResolvedValue([
      { ...bren, forms: [{ kind: 'monster', key: 'awakened shrub', name: 'Awakened Shrub' }] },
    ]);
    vi.mocked(window.trifold.compendium.findByKey).mockImplementation(async (kind, key) =>
      kind === 'monster' && key === 'awakened shrub' ? [shrub()] : [],
    );
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(<SheetsPage />, view([creature()]));
    await user.click(await screen.findByRole('tab', { name: 'Awakened Shrub' }));
    const sheet = screen.getByTestId('form-sheet');
    expect(sheet).toHaveTextContent(
      'A form of Bren. Hit points, conditions and the token stay Bren’s.',
    );
    expect(await screen.findByTestId('linked-record')).toHaveTextContent('False Appearance');
    // The character's own HP, not a second pool.
    expect(screen.getByTestId('sheet-live')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Brannoc' }));
    expect(screen.getByTestId('sheet-view')).toBeInTheDocument();
  });

  it('adds a form from a search while editing, and removes it', async () => {
    vi.mocked(window.trifold.compendium.search).mockResolvedValue({
      rows: [
        {
          id: 'm1',
          kind: 'monster',
          key: 'awakened shrub',
          name: 'Awakened Shrub',
          displayName: 'Awakened Shrub',
          sourceId: 'srd-2024',
          sourceName: 'SRD 5.2',
          edition: '2024',
          editions: ['2024'],
          otherVersions: [],
          cr: '0',
        } as never,
      ],
      total: 1,
      tookMs: 0,
    });
    useJoinedStore.setState({ current: campaign('K1') });
    useCharacterStore.setState({ editingSheet: true });
    const user = userEvent.setup();
    mount(<SheetsPage />, view([creature()]));
    const forms = within(await screen.findByTestId('forms-section'));
    await user.type(forms.getByRole('searchbox', { name: 'Add a form' }), 'shrub');
    await user.click(await forms.findByRole('button', { name: 'Awakened Shrub' }));
    const saved = () => useCharacterStore.getState().characters.find((c) => c.id === 'K1')!;
    expect(saved().forms).toEqual([
      { kind: 'monster', key: 'awakened shrub', name: 'Awakened Shrub' },
    ]);
    await user.click(forms.getByRole('button', { name: 'Remove Awakened Shrub' }));
    expect(saved().forms).toEqual([]);
  });

  it('pins a creature as a form from its compendium page, for the linked character only', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    useCharacterStore.setState({ characters: [bren], loaded: true });
    const user = userEvent.setup();
    const { unmount } = render(<FormToggle record={shrub()} />);
    const pin = screen.getByRole('button', { name: 'Pin as a form' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await user.click(pin);
    expect(useCharacterStore.getState().characters[0]!.forms).toEqual([
      { kind: 'monster', key: 'awakened shrub', name: 'Awakened Shrub' },
    ]);
    unmount();
    // No joined campaign, no character to pin to.
    useJoinedStore.setState({ current: null });
    render(<FormToggle record={shrub()} />);
    expect(screen.queryByRole('button', { name: 'Pin as a form' })).toBeNull();
  });
});

describe('Resources at the table (ADR 0074)', () => {
  it('sends a spent hit die’s healing to the table as an HP change', async () => {
    useJoinedStore.setState({ current: campaign('K1') });
    const user = userEvent.setup();
    mount(<SheetsPage />, view([creature()]));
    await user.click(await screen.findByRole('button', { name: 'Spend a d8' }));
    expect(window.trifold.joined.send).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        type: 'intent',
        creatureKind: 'pc',
        creatureId: 'p1',
        intent: { kind: 'hp', delta: expect.any(Number) },
      }),
    );
  });
});
