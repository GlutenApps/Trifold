import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Combatant, Scene, Token } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { CombatView } from './CombatView';

function combatant(id: string, extra: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    maskedName: id,
    revealed: true,
    ref: { kind: 'custom', name: id },
    role: 'enemy',
    initiative: 10,
    initiativeBonus: 0,
    dexterity: 10,
    hp: { current: 20, max: 20, temp: 0 },
    saves: {},
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    conditions: [],
    concentrating: null,
    counters: [],
    recharges: [],
    deathSaves: null,
    dead: false,
    hidden: false,
    held: false,
    isLair: false,
    ...extra,
  };
}

const hp = (id: string) =>
  useCombatStore.getState().state!.combatants.find((c) => c.id === id)!.hp.current;

beforeEach(() => {
  useCombatStore.setState({
    encounterId: 'enc',
    state: {
      round: 1,
      turnIndex: 0,
      combatants: [
        combatant('Wolf'),
        combatant('Thora', { ref: { kind: 'pc', pcId: 'p', name: 'Thora' }, role: 'ally' }),
        combatant('Zed', { ref: { kind: 'pc', pcId: 'z', name: 'Zed' }, role: 'ally' }),
      ],
      log: [],
      startedAt: '2026-09-28T00:00:00.000Z',
    },
    records: {},
    selectedId: 'Wolf',
    pendingDamage: [],
    saveCall: null,
    savePrompts: [],
    concentrationPrompt: null,
    missing: [],
    error: null,
  });
});

describe('CombatView', () => {
  it('puts the way back to the encounter list before the round', () => {
    render(<CombatView />);
    const bar = screen.getByRole('heading', { name: /Round 1/ }).parentElement!;
    const buttons = within(bar).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Back to encounters');
    expect(screen.queryByRole('group', { name: 'Roll mode' })).not.toBeInTheDocument();
  });

  it('opens the selected combatant’s controls under its row and follows the selection', async () => {
    render(<CombatView />);
    const rows = screen.getAllByTestId('combatant-row');
    expect(rows[0]!.nextElementSibling).toHaveAttribute('data-testid', 'combatant-drawer');
    expect(screen.getByRole('region', { name: 'Wolf controls' })).toBeInTheDocument();

    await userEvent.click(rows[1]!);
    expect(screen.queryByRole('region', { name: 'Wolf controls' })).not.toBeInTheDocument();
    expect(rows[1]!.nextElementSibling).toHaveAttribute('data-testid', 'combatant-drawer');

    // Clicking the open row again folds it away.
    await userEvent.click(rows[1]!);
    expect(screen.queryByTestId('combatant-drawer')).not.toBeInTheDocument();
  });

  it('assigns one rolled attack to several targets, full or half each', async () => {
    render(<CombatView />);
    act(() =>
      useCombatStore.setState({
        pendingDamage: [
          {
            id: 'p1',
            sourceId: 'Wolf',
            sourceName: 'Wolf',
            featureName: 'Bite',
            label: 'Bite',
            parts: [{ amount: 9, type: 'piercing' }],
          },
        ],
      }),
    );
    const popup = screen.getByRole('dialog', { name: 'Wolf — Bite' });
    // The attacker is not a target of its own roll.
    expect(within(popup).queryByRole('group', { name: 'Damage to Wolf' })).not.toBeInTheDocument();
    expect(within(popup).getByRole('button', { name: 'Apply' })).toBeDisabled();

    await userEvent.click(within(popup).getByRole('button', { name: 'Full damage to Thora' }));
    await userEvent.click(within(popup).getByRole('button', { name: 'Half damage to Zed' }));
    await userEvent.click(within(popup).getByRole('button', { name: 'Apply' }));

    expect(hp('Thora')).toBe(11);
    expect(hp('Zed')).toBe(16);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts a called save from the results and lets the DM set each PC', async () => {
    render(<CombatView />);
    act(() =>
      useCombatStore.setState({
        selectedId: 'Thora',
        state: {
          ...useCombatStore.getState().state!,
          combatants: [
            ...useCombatStore.getState().state!.combatants,
            combatant('Bandit'),
            combatant('Guard'),
          ],
        },
        saveCall: {
          id: 's1',
          sourceId: 'Wolf',
          sourceName: 'Wolf',
          featureName: 'Howl',
          ability: 'con',
          dc: 13,
          halfOnSuccess: true,
          creatures: [
            { id: 'Bandit', name: 'Bandit', total: 8, natural: 6, success: false },
            { id: 'Guard', name: 'Guard', total: 15, natural: 12, success: true },
          ],
          pcs: [
            { id: 'Thora', name: 'Thora', bonus: 3 },
            { id: 'Zed', name: 'Zed', bonus: 1 },
          ],
        },
      }),
    );
    const popup = screen.getByRole('dialog', { name: 'Wolf — Howl' });
    expect(within(popup).getByRole('button', { name: 'Full damage to Bandit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(popup).getByRole('button', { name: 'Half damage to Guard' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.type(within(popup).getByLabelText('Damage amount'), '10');
    await userEvent.click(within(popup).getByRole('button', { name: 'Half damage to Thora' }));
    await userEvent.click(within(popup).getByRole('button', { name: 'Apply' }));

    expect(hp('Bandit')).toBe(10);
    expect(hp('Guard')).toBe(15);
    expect(hp('Thora')).toBe(15);
    expect(hp('Zed')).toBe(20);
    expect(useCombatStore.getState().saveCall).toBeNull();
  });

  it('deals typed damage to several from the drawer', async () => {
    render(<CombatView />);
    await userEvent.type(screen.getByLabelText('Amount'), '6');
    await userEvent.click(screen.getByRole('button', { name: 'Damage several' }));
    const popup = screen.getByRole('dialog', { name: 'Damage several' });
    // The combatant it was opened from starts at full.
    expect(within(popup).getByRole('button', { name: 'Full damage to Wolf' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(popup).getByRole('button', { name: 'Full damage to Zed' }));
    await userEvent.click(within(popup).getByRole('button', { name: 'Apply' }));
    expect(hp('Wolf')).toBe(14);
    expect(hp('Zed')).toBe(14);
    expect(hp('Thora')).toBe(20);
  });

  it('dismisses with Escape', async () => {
    render(<CombatView />);
    act(() =>
      useCombatStore.setState({
        pendingDamage: [
          {
            id: 'p1',
            sourceId: 'Wolf',
            sourceName: 'Wolf',
            featureName: 'Bite',
            label: 'Bite',
            parts: [{ amount: 5 }],
          },
        ],
      }),
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useCombatStore.getState().pendingDamage).toEqual([]);
  });
});

describe('CombatView: the row toolbar and the map (ADR 0012)', () => {
  const now = '2026-09-28T00:00:00.000Z';
  const wolfToken: Token = {
    id: 'w1',
    kind: 'creature',
    ref: { kind: 'custom', name: 'Wolf' },
    label: 'Wolf',
    x: 1,
    y: 1,
    footprint: 1,
    role: 'enemy',
    hidden: false,
    nameMasked: true,
    dead: false,
  };
  const cave = {
    schemaVersion: 1,
    id: 's1',
    kind: 'blankGrid',
    title: 'Cave',
    tokens: [wolfToken],
    blank: { cols: 10, rows: 10 },
    createdAt: now,
    updatedAt: now,
  } as unknown as Scene;

  it('ends with a red text button, has no hold button, and offers to track a creature as an NPC', () => {
    useCampaignStore.setState({ current: null });
    render(<CombatView />);
    const end = screen.getByRole('button', { name: 'End combat' });
    expect(end).toHaveClass('btn', 'danger');
    expect(end).toHaveTextContent('End combat');
    expect(screen.queryByRole('button', { name: /hold/i })).not.toBeInTheDocument();
    const wolf = screen.getByRole('region', { name: 'Wolf controls' });
    expect(within(wolf).getByRole('button', { name: 'Mark dead' })).toBeInTheDocument();
    expect(within(wolf).getByRole('button', { name: 'Hide from players' })).toBeInTheDocument();
    expect(within(wolf).getByRole('button', { name: 'Track as NPC' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link to map' })).not.toBeInTheDocument();
  });

  it('links a combatant to the matching free token on the map in play', async () => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', slug: 'cave', settings: { initiativeMode: 'perGroup' } },
        pcs: [],
        npcs: [],
        scenes: [cave],
        encounters: [{ id: 'enc', sceneId: 's1', combatants: [] }],
      } as unknown as CampaignBundle,
    });
    render(<CombatView />);
    const wolf = screen.getByRole('region', { name: 'Wolf controls' });
    await userEvent.click(within(wolf).getByRole('button', { name: 'Link to map' }));
    expect(useCombatStore.getState().state!.combatants[0]!.tokenId).toBe('w1');
    expect(screen.getAllByTestId('combatant-row')[0]).toHaveTextContent('map');
    expect(within(wolf).queryByRole('button', { name: 'Link to map' })).not.toBeInTheDocument();
    const unlink = within(wolf).getByRole('button', { name: 'Unlink from map' });
    expect(unlink).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(unlink);
    expect(useCombatStore.getState().state!.combatants[0]!.tokenId).toBeUndefined();
    expect(within(wolf).getByRole('button', { name: 'Link to map' })).toBeInTheDocument();
  });

  it('masks and reveals a name with one toggle', async () => {
    useCampaignStore.setState({ current: null });
    render(<CombatView />);
    const wolf = screen.getByRole('region', { name: 'Wolf controls' });
    const mask = within(wolf).getByRole('button', { name: 'Mask name' });
    expect(mask).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(mask);
    expect(useCombatStore.getState().state!.combatants[0]!.revealed).toBe(false);
    const reveal = within(wolf).getByRole('button', { name: 'Reveal name' });
    expect(reveal).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(reveal);
    expect(useCombatStore.getState().state!.combatants[0]!.revealed).toBe(true);
  });
});

describe('CombatView: adding mid-fight', () => {
  it('opens a panel that adds a waiting PC and a searched creature without leaving the fight', async () => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', slug: 'cave', settings: { initiativeMode: 'perGroup' } },
        pcs: [
          { id: 'z', name: 'Zed', maxHp: 10, ac: 10, initiativeBonus: 0, saves: {} },
          { id: 'b', name: 'Bram', maxHp: 22, ac: 14, initiativeBonus: 0, saves: {} },
        ],
        npcs: [],
        encounters: [{ id: 'enc', combatants: [], results: [] }],
        scenes: [],
      } as unknown as CampaignBundle,
    });
    vi.mocked(window.trifold.compendium.search).mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          displayName: 'Goblin',
          sourceId: 's',
          sourceName: 'SRD',
          key: 'goblin',
          edition: '2024',
          cr: '1/4',
          type: 'humanoid',
          kind: 'monster',
        },
      ],
      total: 1,
      tookMs: 1,
    } as never);
    render(<CombatView />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to fight' }));
    const panel = screen.getByRole('region', { name: 'Add to the fight' });
    // Zed is already in; Bram is waiting.
    expect(within(panel).queryByRole('button', { name: '+ Zed' })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: '+ Bram' }));
    await waitFor(() => expect(screen.getAllByTestId('combatant-row')).toHaveLength(4));
    expect(within(panel).queryByRole('button', { name: '+ Bram' })).not.toBeInTheDocument();

    await userEvent.type(within(panel).getByLabelText('How many'), '2', {
      initialSelectionStart: 0,
      initialSelectionEnd: 1,
    });
    await userEvent.type(within(panel).getByLabelText('Add creature'), 'gob');
    await userEvent.click(await within(panel).findByRole('option', { name: /Goblin/ }));
    await waitFor(() => expect(screen.getAllByTestId('combatant-row')).toHaveLength(6));
    const names = useCombatStore.getState().state!.combatants.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Goblin 1', 'Goblin 2', 'Bram']));
    await userEvent.click(within(panel).getByRole('button', { name: 'Close add to fight' }));
    expect(screen.queryByRole('region', { name: 'Add to the fight' })).not.toBeInTheDocument();
  });
});
