import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { CampaignCounter } from '@trifold/schema';
import { installHotkeys, registerHotkey } from '../../hotkeys';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCountersStore } from '../../stores/countersStore';
import { discardPendingSaves, flushPendingSaves } from '../../stores/pendingSaves';
import { useShellStore } from '../../stores/shellStore';
import { defaultLayout } from '../../stores/shellLayout';
import { CountersTool } from './CountersTool';

const now = '2026-11-10T12:00:00.000Z';

function counter(id: string, name: string, extra: Partial<CampaignCounter> = {}): CampaignCounter {
  return {
    schemaVersion: 1,
    id,
    name,
    initial: 3,
    value: 3,
    step: 1,
    altStep: 5,
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function seed(counters: CampaignCounter[]) {
  useCampaignStore.setState({
    current: {
      campaign: { schemaVersion: 1, id: 'c1', slug: 'c', name: 'C', settings: {} },
      pcs: [],
      adventures: [],
      notes: [],
      npcs: [],
      encounters: [],
      scenes: [],
      counters,
    } as unknown as CampaignBundle,
  });
}

const current = () => useCampaignStore.getState().current!.counters;
const valueOf = (name: string) => current().find((c) => c.name === name)?.value;
const row = (name: string) => screen.getByRole('listitem', { name });

describe('CountersTool', () => {
  beforeEach(() => {
    useShellStore.setState({
      space: 'console',
      layout: defaultLayout(),
      flyout: null,
      viewportWidth: 1600,
    });
    useCountersStore.setState({ error: null, pendingFocus: false });
    vi.mocked(window.trifold.counters.save).mockClear();
    vi.mocked(window.trifold.counters.remove).mockClear();
  });

  afterEach(() => discardPendingSaves());

  it('creates a counter from just a name, at 0 with a step of 1 and no alternate step', async () => {
    seed([]);
    const user = userEvent.setup();
    render(<CountersTool />);
    expect(screen.getByText(/No counters yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first counter' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New counter' }));
    await user.type(screen.getByLabelText('Name'), 'Ritual rounds{Enter}');
    await waitFor(() => expect(current()).toHaveLength(1));
    expect(window.trifold.counters.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: '', name: 'Ritual rounds', initial: 0, value: 0, step: 1 }),
    );
    expect(vi.mocked(window.trifold.counters.save).mock.calls[0]![0]).not.toHaveProperty('altStep');
    // No alternate step: just the one pair of buttons.
    expect(
      within(row('Ritual rounds')).getAllByRole('button', { name: /^(Add|Take) \d+/ }),
    ).toHaveLength(2);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('refuses a form with min above max and says why', async () => {
    seed([]);
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: 'New counter' }));
    await user.type(screen.getByLabelText('Name'), 'Bad');
    await user.type(screen.getByLabelText('Minimum'), '5');
    await user.type(screen.getByLabelText('Maximum'), '2');
    await user.click(screen.getByRole('button', { name: 'Create counter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('At least the minimum');
    expect(window.trifold.counters.save).not.toHaveBeenCalled();
  });

  it('adjusts by 1 and by the step, and writes a burst of presses once', async () => {
    seed([counter('t', 'Torches', { step: 1, altStep: 2 })]);
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: 'Add 1 to Torches' }));
    await user.click(screen.getByRole('button', { name: 'Add 2 to Torches' }));
    await user.click(screen.getByRole('button', { name: 'Take 1 from Torches' }));
    await user.click(screen.getByRole('button', { name: 'Take 2 from Torches' }));
    await user.click(screen.getByRole('button', { name: 'Take 2 from Torches' }));
    expect(valueOf('Torches')).toBe(1);
    expect(screen.getByRole('button', { name: /^Torches: 1\./ })).toBeInTheDocument();
    expect(window.trifold.counters.save).not.toHaveBeenCalled();
    await act(() => flushPendingSaves());
    expect(window.trifold.counters.save).toHaveBeenCalledTimes(1);
    expect(window.trifold.counters.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't', value: 1 }),
    );
  });

  it('stops at a bound, marks it and flashes when a press runs into it', async () => {
    seed([counter('lr', 'Legendary resistance', { value: 2, min: 0, max: 3 })]);
    const user = userEvent.setup();
    render(<CountersTool />);
    const r = row('Legendary resistance');
    await user.click(within(r).getByRole('button', { name: 'Add 5 to Legendary resistance' }));
    expect(valueOf('Legendary resistance')).toBe(3);
    expect(r).toHaveClass('at-max');
    expect(within(r).getByText('max')).toBeInTheDocument();
    expect(r.querySelector('.counter-num')).toHaveClass('flash-max');
    expect(within(r).getByRole('button', { name: 'Add 1 to Legendary resistance' })).toHaveClass(
      'at-bound',
    );
    // Pressing again still flashes and the value stays put.
    await user.click(within(r).getByRole('button', { name: 'Add 1 to Legendary resistance' }));
    expect(valueOf('Legendary resistance')).toBe(3);
    expect(r.querySelector('.counter-num')).toHaveClass('flash-max');

    await user.click(within(r).getByRole('button', { name: 'Take 5 from Legendary resistance' }));
    expect(valueOf('Legendary resistance')).toBe(0);
    expect(r).toHaveClass('at-min');
    expect(r.querySelector('.counter-num')).toHaveClass('flash-min');
  });

  it('takes a typed value, clamped; Escape keeps the old one', async () => {
    seed([counter('w', 'Waves', { value: 1, max: 10 })]);
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: /^Waves: 1/ }));
    const field = screen.getByLabelText('New value for Waves');
    await user.clear(field);
    await user.type(field, '40{Enter}');
    expect(valueOf('Waves')).toBe(10);

    await user.click(screen.getByRole('button', { name: /^Waves: 10/ }));
    await user.clear(screen.getByLabelText('New value for Waves'));
    await user.type(screen.getByLabelText('New value for Waves'), '4{Escape}');
    expect(valueOf('Waves')).toBe(10);
    expect(screen.queryByLabelText('New value for Waves')).not.toBeInTheDocument();
  });

  it('resets to the initial value', async () => {
    seed([counter('t', 'Torches', { initial: 6, value: 1 })]);
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: 'Reset Torches to 6' }));
    expect(valueOf('Torches')).toBe(6);
  });

  it('adjusts a focused counter with the arrow keys, Page keys, Home and End', async () => {
    seed([counter('t', 'Torches', { value: 5, min: 0, max: 20, step: 1, altStep: 4 })]);
    const user = userEvent.setup();
    render(<CountersTool />);
    screen.getByRole('button', { name: /^Torches: 5/ }).focus();
    await user.keyboard('{ArrowUp}');
    expect(valueOf('Torches')).toBe(6);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(valueOf('Torches')).toBe(10);
    await user.keyboard('{ArrowDown}{PageDown}');
    expect(valueOf('Torches')).toBe(5);
    await user.keyboard('{PageUp}');
    expect(valueOf('Torches')).toBe(9);
    await user.keyboard('{End}');
    expect(valueOf('Torches')).toBe(20);
    await user.keyboard('{Home}');
    expect(valueOf('Torches')).toBe(0);
  });

  it('never changes a counter with the mouse wheel, focused or not', () => {
    seed([counter('a', 'A', { value: 0 })]);
    render(<CountersTool />);
    screen.getByRole('button', { name: /^A: 0/ }).focus();
    fireEvent.wheel(row('A'), { deltaY: -100 });
    fireEvent.wheel(row('A'), { deltaY: 100, shiftKey: true });
    expect(valueOf('A')).toBe(0);
  });

  it('makes a counter with its own primary and alternate steps', async () => {
    seed([]);
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: 'New counter' }));
    await user.type(screen.getByLabelText('Name'), 'Gold');
    await user.clear(screen.getByLabelText('Primary step'));
    await user.type(screen.getByLabelText('Primary step'), '10');
    await user.type(screen.getByLabelText('Alternate step'), '100');
    await user.click(screen.getByRole('button', { name: 'Create counter' }));
    await waitFor(() => expect(current()).toHaveLength(1));
    expect(current()[0]).toMatchObject({ step: 10, altStep: 100 });
    const r = row('Gold');
    for (const name of [
      'Take 100 from Gold',
      'Take 10 from Gold',
      'Add 10 to Gold',
      'Add 100 to Gold',
    ]) {
      expect(within(r).getByRole('button', { name })).toBeInTheDocument();
    }
    await user.click(within(r).getByRole('button', { name: 'Add 100 to Gold' }));
    await user.click(within(r).getByRole('button', { name: 'Take 10 from Gold' }));
    expect(valueOf('Gold')).toBe(90);
  });

  it('uses the primary step for Shift+arrows when there is no alternate step', async () => {
    seed([counter('t', 'Torches', { value: 5, step: 2, altStep: undefined })]);
    const user = userEvent.setup();
    render(<CountersTool />);
    screen.getByRole('button', { name: /^Torches: 5/ }).focus();
    await user.keyboard('{ArrowUp}');
    expect(valueOf('Torches')).toBe(7);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}{PageDown}');
    expect(valueOf('Torches')).toBe(3);
  });

  it('puts up to three counters on the TV and takes one off again', async () => {
    seed(['A', 'B', 'C', 'D'].map((n, i) => counter(n, n, { order: i, showOnTv: i < 2 })));
    const user = userEvent.setup();
    render(<CountersTool />);
    expect(within(row('A')).getByRole('button', { name: 'Take A off the TV' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Show C on the TV' }));
    expect(current().find((c) => c.id === 'C')?.showOnTv).toBe(true);
    expect(window.trifold.counters.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'C', showOnTv: true }),
    );
    // Three are on: the fourth cannot join until one comes off.
    expect(screen.getByRole('button', { name: 'Show D on the TV' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Take A off the TV' }));
    expect(current().find((c) => c.id === 'A')).not.toHaveProperty('showOnTv');
    expect(screen.getByRole('button', { name: 'Show D on the TV' })).toBeEnabled();
  });

  it('edits in place, keeping the value but pulling it inside a new maximum', async () => {
    seed([counter('t', 'Torches', { value: 9 })]);
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: 'Edit Torches' }));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Lamps');
    await user.type(screen.getByLabelText('Maximum'), '4');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(window.trifold.counters.save).toHaveBeenCalled());
    expect(window.trifold.counters.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't', name: 'Lamps', value: 4, max: 4, initial: 3 }),
    );
    expect(row('Lamps')).toBeInTheDocument();
  });

  it('deletes only after the inline confirm', async () => {
    seed([counter('t', 'Torches')]);
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: 'Delete Torches' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(window.trifold.counters.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Torches' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(current()).toHaveLength(0));
    expect(window.trifold.counters.remove).toHaveBeenCalledWith('t');
  });

  it('drags a counter to a new place', async () => {
    const list = [
      counter('a', 'A', { order: 0 }),
      counter('b', 'B', { order: 1 }),
      counter('c', 'C', { order: 2 }),
    ];
    seed(list);
    window.trifold.counters.move = vi.fn(async () => [
      { ...list[1]!, order: 0 },
      { ...list[2]!, order: 1 },
      { ...list[0]!, order: 2 },
    ]);
    render(<CountersTool />);
    const dataTransfer = {
      setData: vi.fn(),
      getData: () => 'a',
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(row('A'), { dataTransfer });
    // jsdom rows have no height, so the drop lands after the row it is over.
    fireEvent.dragOver(row('C'), { dataTransfer });
    fireEvent.drop(row('C'), { dataTransfer });
    await waitFor(() => expect(window.trifold.counters.move).toHaveBeenCalledWith('a', 2));
    expect(current().map((c) => c.name)).toEqual(['B', 'C', 'A']);
  });

  it('Ctrl+Alt+C opens the tool and focuses the first counter', async () => {
    seed([counter('t', 'Torches')]);
    const offs = [
      registerHotkey({
        id: 'counters.open',
        combo: 'Ctrl+Alt+C',
        description: '',
        run: () => useCountersStore.getState().summon(),
      }),
      installHotkeys(),
    ];
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.keyboard('{Control>}{Alt>}c{/Alt}{/Control}');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Torches: 3/ })).toHaveFocus());
    expect(useShellStore.getState().layout.dock.sections).toContainEqual({
      tool: 'counters',
      open: true,
    });
    offs.forEach((off) => off());
  });

  it('shows a failed write as a banner in the tool', async () => {
    seed([]);
    vi.mocked(window.trifold.counters.save).mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    render(<CountersTool />);
    await user.click(screen.getByRole('button', { name: 'New counter' }));
    await user.type(screen.getByLabelText('Name'), 'Torches{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
