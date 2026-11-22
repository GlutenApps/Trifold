import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientView, CreatureView, JoinedSummary } from '@trifold/api';
import { useShellStore } from '../../stores/shellStore';
import { InitiativeTool } from './InitiativeTool';
import { conditionIntents, hpIntent, MyCharactersTool } from './MyCharactersTool';
import { PlayerTableProvider } from './PlayerTable';

const campaign: JoinedSummary = {
  campaignId: 'c1',
  campaignName: 'Greyford',
  displayName: 'Sam',
  characterId: null,
  joinedAt: '2026-11-23T18:00:00.000Z',
  lastLiveAt: null,
  claimed: true,
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

const view = (mine: CreatureView[], extra: Partial<ClientView> = {}): ClientView => ({
  campaignName: 'Greyford',
  live: true,
  mine,
  picker: [],
  map: null,
  reclaimMode: 'open',
  ...extra,
});

/** Plays main: the link opens and the table sends a view. */
let table: { link(link: string): void; state(v: ClientView): void };

beforeEach(() => {
  const listeners = new Map<string, (payload: never) => void>();
  window.trifold.on = vi.fn((event: string, listener: (payload: never) => void) => {
    listeners.set(event, listener);
    return () => undefined;
  }) as never;
  window.trifold.joined.send = vi.fn(async () => undefined);
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

const sent = () =>
  (window.trifold.joined.send as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as object);

function mount(tool: React.ReactNode, v?: ClientView) {
  render(<PlayerTableProvider campaign={campaign}>{tool}</PlayerTableProvider>);
  if (v) {
    table.link('open');
    table.state(v);
  }
}

describe('hpIntent and conditionIntents', () => {
  it('turns the HP editor’s buttons into the requests a phone sends', () => {
    const c = creature();
    expect(hpIntent(c, 'damage', 7)).toEqual({ kind: 'hp', delta: -7 });
    expect(hpIntent(c, 'heal', 5)).toEqual({ kind: 'hp', delta: 5 });
    expect(hpIntent(c, 'temp', 8)).toEqual({ kind: 'setTemp', value: 8 });
    // Set travels as a change from what the row shows, and never past the maximum.
    expect(hpIntent(c, 'set', 12)).toEqual({ kind: 'hp', delta: -8 });
    expect(hpIntent(c, 'set', 99)).toEqual({ kind: 'hp', delta: 4 });
  });

  it('asks for a condition added or removed, and lets the table replace Exhaustion', () => {
    const prone = { id: 'a', name: 'Prone' };
    const tired = { id: 'b', name: 'Exhaustion', level: 1 };
    expect(conditionIntents([prone], [prone, { id: 'n', name: 'Poisoned' }])).toEqual([
      { kind: 'addCondition', name: 'Poisoned' },
    ]);
    expect(conditionIntents([prone, tired], [tired])).toEqual([
      { kind: 'removeCondition', id: 'a' },
    ]);
    expect(
      conditionIntents([prone, tired], [prone, { id: 'n', name: 'Exhaustion', level: 2 }]),
    ).toEqual([{ kind: 'addCondition', name: 'Exhaustion', level: 2 }]);
  });
});

describe('MyCharactersTool', () => {
  it('says where the table is while it is not up', () => {
    mount(<MyCharactersTool />);
    expect(screen.getByRole('status')).toHaveTextContent('Looking for your GM’s table');
  });

  it('lists the character, then its companions, with HP and conditions as the GM’s rows show them', () => {
    mount(
      <MyCharactersTool />,
      view([
        creature({
          kind: 'summon',
          id: 't9',
          name: 'Wolf',
          companionOf: 'p1',
          summon: {
            owner: { kind: 'pc', id: 'p1' },
            type: 'Beast',
            persistent: false,
            concentrationLost: false,
          },
        }),
        creature({ conditions: [{ id: 'x', name: 'Prone' }], turn: 'next' }),
      ]),
    );
    const rows = screen.getAllByTestId('my-character');
    expect(rows.map((r) => within(r).getAllByRole('button')[0]?.textContent)).toEqual([
      'Brannoc',
      'Wolf',
    ]);
    expect(within(rows[0]!).getByRole('button', { name: "Change Brannoc's HP" })).toHaveTextContent(
      'HP 20/24',
    );
    expect(within(rows[0]!).getByText('Prone')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('status')).toHaveTextContent('You’re next');
    // Only a companion can be removed.
    expect(within(rows[0]!).queryByRole('button', { name: /^Remove Brannoc$/ })).toBeNull();
    expect(within(rows[1]!).getByRole('button', { name: 'Remove Wolf' })).toBeInTheDocument();
  });

  it('sends damage, a condition and a removal as requests, and changes nothing itself', async () => {
    const user = userEvent.setup();
    mount(<MyCharactersTool />, view([creature({ conditions: [{ id: 'x', name: 'Prone' }] })]));
    await user.click(screen.getByRole('button', { name: "Change Brannoc's HP" }));
    await user.type(screen.getByRole('spinbutton', { name: 'Amount for Brannoc' }), '7');
    await user.click(screen.getByRole('button', { name: 'Damage' }));
    await user.click(screen.getByRole('button', { name: 'Add a condition to Brannoc' }));
    await user.click(screen.getByRole('menuitem', { name: 'Poisoned' }));
    await user.click(screen.getByRole('button', { name: 'Remove Prone from Brannoc' }));

    const intent = (i: object) => ({
      type: 'intent',
      creatureKind: 'pc',
      creatureId: 'p1',
      intent: i,
    });
    expect(sent()).toEqual([
      intent({ kind: 'hp', delta: -7 }),
      intent({ kind: 'addCondition', name: 'Poisoned' }),
      intent({ kind: 'removeCondition', id: 'x' }),
    ]);
    // The row still shows what the table last said.
    expect(screen.getByRole('button', { name: "Change Brannoc's HP" })).toHaveTextContent(
      'HP 20/24',
    );
    table.state(view([creature({ hp: { current: 13, max: 24, temp: 0 } })]));
    expect(screen.getByRole('button', { name: "Change Brannoc's HP" })).toHaveTextContent(
      'HP 13/24',
    );
  });

  it('shows numbers the player may not change as text', () => {
    mount(
      <MyCharactersTool />,
      view([
        creature({
          editable: { hp: false, maxHp: false, ac: false, conditions: false },
          conditions: [{ id: 'x', name: 'Prone' }],
        }),
      ]),
    );
    expect(screen.queryByRole('button', { name: "Change Brannoc's HP" })).toBeNull();
    expect(screen.getByText('HP 20/24')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a condition to Brannoc' })).toBeNull();
  });

  it('removes a summon only after the inline confirm, and switches character', async () => {
    const user = userEvent.setup();
    mount(
      <MyCharactersTool />,
      view([creature(), creature({ kind: 'summon', id: 't9', name: 'Wolf', companionOf: 'p1' })]),
    );
    await user.click(screen.getByRole('button', { name: 'Remove Wolf' }));
    expect(sent()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Switch character' }));
    expect(sent()).toEqual([{ type: 'dismiss', tokenId: 't9' }, { type: 'switch' }]);
  });

  it('selects a creature for the rest of the console', async () => {
    const user = userEvent.setup();
    mount(
      <MyCharactersTool />,
      view([creature(), creature({ kind: 'npc', id: 'n1', name: 'Hesper', companionOf: 'p1' })]),
    );
    const hesper = screen.getByRole('button', { name: 'Hesper' });
    expect(hesper).toHaveAttribute('aria-pressed', 'false');
    await user.click(hesper);
    expect(hesper).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('InitiativeTool', () => {
  it('asks for a roll the tracker is waiting for, and brings itself forward', async () => {
    const user = userEvent.setup();
    useShellStore.getState().enterPlayerConsole('c1');
    useShellStore.getState().toggleSection('initiative');
    expect(
      useShellStore.getState().layout.dock.sections.find((s) => s.tool === 'initiative')?.open,
    ).toBe(false);
    mount(<InitiativeTool />, view([creature({ inFight: true, needsInitiative: true })]));
    expect(
      useShellStore.getState().layout.dock.sections.find((s) => s.tool === 'initiative')?.open,
    ).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Initiative' }), '17');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(sent()).toEqual([
      {
        type: 'intent',
        creatureKind: 'pc',
        creatureId: 'p1',
        intent: { kind: 'initiative', value: 17 },
      },
    ]);
    useShellStore.getState().leaveCampaign();
  });

  it('shows the order as the TV does, with who is acting and the player’s own turn', () => {
    mount(
      <InitiativeTool />,
      view([creature({ inFight: true, turn: 'now' })], {
        overlays: {
          healthBars: false,
          timer: null,
          counters: [],
          initiative: {
            round: 3,
            activeId: 'k1',
            entries: [
              { id: 'k1', name: 'Brannoc', role: 'ally', isPc: true, dead: false, bloodied: false },
              {
                id: 'k2',
                name: 'Humanoid 2',
                role: 'enemy',
                isPc: false,
                dead: false,
                bloodied: true,
              },
              {
                id: 'k3',
                name: 'Humanoid 3',
                role: 'enemy',
                isPc: false,
                dead: true,
                bloodied: false,
              },
            ],
          },
        },
      }),
    );
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    expect(screen.getByText('Round 3')).toBeInTheDocument();
    const entries = within(screen.getByRole('list', { name: 'Turn order' })).getAllByRole(
      'listitem',
    );
    expect(entries.map((e) => e.textContent)).toEqual([
      'Brannocacting',
      'Humanoid 2bloodied',
      'Humanoid 3down',
    ]);
    expect(entries[0]).toHaveAttribute('aria-current', 'true');
  });

  it('still tells the player their turn when the GM is not showing the order', () => {
    mount(<InitiativeTool />, view([creature({ inFight: true, turn: 'next' })]));
    expect(screen.getByText('You’re next')).toBeInTheDocument();
    expect(screen.getByText(/isn’t showing the turn order/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Turn order' })).toBeNull();
  });

  it('says so when no fight is running', () => {
    mount(<InitiativeTool />, view([creature()]));
    expect(screen.getByText('No fight is running.')).toBeInTheDocument();
  });
});
