import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Combatant } from '@trifold/schema';
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
