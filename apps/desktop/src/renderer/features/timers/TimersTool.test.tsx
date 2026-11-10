import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { CampaignTimer } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useMusicStore } from '../../stores/musicStore';
import { useShellStore } from '../../stores/shellStore';
import { defaultLayout } from '../../stores/shellLayout';
import { useTimersStore } from '../../stores/timersStore';
import { TimersTool } from './TimersTool';

const at = '2026-11-10T12:00:00.000Z';

function timer(id: string, name: string, extra: Partial<CampaignTimer> = {}): CampaignTimer {
  return {
    schemaVersion: 1,
    id,
    name,
    durationSec: 60,
    chime: true,
    order: 0,
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}

function seed(timers: CampaignTimer[], campaignId = 'c1') {
  useCampaignStore.setState({
    current: {
      campaign: { schemaVersion: 1, id: campaignId, slug: 'c', name: 'C', settings: {} },
      pcs: [],
      adventures: [],
      notes: [],
      npcs: [],
      encounters: [],
      scenes: [],
      counters: [],
      timers,
    } as unknown as CampaignBundle,
  });
}

const timers = () => useCampaignStore.getState().current!.timers;
const row = (name: string) => screen.getByRole('listitem', { name });
const clock = (name: string) => within(row(name)).getByTestId('timer-clock');
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
let chime: ReturnType<typeof vi.fn<() => void>>;
/** Lets the bridge's promises settle; waitFor would wait on the faked timers for ever. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });

describe('TimersTool', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(at) });
    useShellStore.setState({
      space: 'console',
      layout: defaultLayout(),
      flyout: null,
      viewportWidth: 1600,
    });
    useTimersStore.setState({ runs: {}, error: null, pendingFocus: false });
    chime = vi.fn<() => void>();
    useMusicStore.setState({ chime });
    vi.mocked(window.trifold.timers.save).mockClear();
    vi.mocked(window.trifold.timers.remove).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a timer from a preset, chiming by default', async () => {
    seed([]);
    render(<TimersTool />);
    press('New timer');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Decide' } });
    press('30s');
    expect(screen.getByLabelText('Duration')).toHaveValue('0:30');
    expect(screen.getByRole('button', { name: '30s' })).toHaveAttribute('aria-pressed', 'true');
    press('Create timer');
    await flush();
    expect(timers()).toHaveLength(1);
    expect(window.trifold.timers.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: '', name: 'Decide', durationSec: 30, chime: true }),
    );
    expect(clock('Decide')).toHaveTextContent('0:30');
  });

  it('takes a typed duration and refuses one it cannot read', async () => {
    seed([]);
    render(<TimersTool />);
    press('New timer');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ritual' } });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: 'soon' } });
    press('Create timer');
    expect(screen.getByRole('alert')).toHaveTextContent('Like 90, 1:30 or 2m');
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '2m 30s' } });
    fireEvent.click(screen.getByLabelText('Chime at zero'));
    press('Create timer');
    await flush();
    expect(timers()).toHaveLength(1);
    expect(timers()[0]).toMatchObject({ durationSec: 150, chime: false });
  });

  it('counts down by the clock, pauses without losing time, and alerts once at zero', () => {
    seed([timer('t', 'Decide', { durationSec: 60 })]);
    render(<TimersTool />);
    expect(screen.getByRole('button', { name: 'Reset Decide to 1m' })).toBeDisabled();
    press('Start Decide');
    advance(10_000);
    expect(clock('Decide')).toHaveTextContent('0:50');
    press('Pause Decide');
    advance(100_000);
    expect(clock('Decide')).toHaveTextContent('0:50');
    expect(within(row('Decide')).getByText('Paused')).toBeInTheDocument();
    press('Resume Decide');
    advance(49_000);
    expect(clock('Decide')).toHaveTextContent('0:01');
    expect(chime).not.toHaveBeenCalled();
    advance(1_100);
    expect(clock('Decide')).toHaveTextContent('0:00');
    expect(row('Decide')).toHaveClass('status-done');
    expect(within(row('Decide')).getByRole('status')).toHaveTextContent('Time’s up');
    expect(chime).toHaveBeenCalledTimes(1);
    advance(30_000);
    expect(chime).toHaveBeenCalledTimes(1);
    // Start again runs the full time.
    press('Start again Decide');
    advance(1_000);
    expect(clock('Decide')).toHaveTextContent('0:59');
  });

  it('runs several timers at once, each on its own clock', () => {
    seed([
      timer('a', 'Guards return', { durationSec: 300, order: 0 }),
      timer('b', 'Bridge falls', { durationSec: 30, order: 1, chime: false }),
    ]);
    render(<TimersTool />);
    press('Start Guards return');
    advance(5_000);
    press('Start Bridge falls');
    advance(30_000);
    expect(clock('Guards return')).toHaveTextContent('4:25');
    expect(row('Bridge falls')).toHaveClass('status-done');
    expect(row('Guards return')).toHaveClass('status-running');
    // A silent timer runs out without a chime.
    expect(chime).not.toHaveBeenCalled();
  });

  it('resets to the full duration', () => {
    seed([timer('t', 'Decide', { durationSec: 90 })]);
    render(<TimersTool />);
    press('Start Decide');
    advance(20_000);
    press('Reset Decide to 1m 30s');
    expect(clock('Decide')).toHaveTextContent('1:30');
    expect(row('Decide')).toHaveClass('status-idle');
    advance(5_000);
    expect(clock('Decide')).toHaveTextContent('1:30');
  });

  it('shows one timer on the TV: putting another on takes the first off', async () => {
    seed([timer('a', 'A', { order: 0, showOnTv: true }), timer('b', 'B', { order: 1 })]);
    render(<TimersTool />);
    expect(screen.getByRole('button', { name: 'Show B on the TV' })).toHaveAttribute(
      'title',
      'Show on the TV instead of A',
    );
    press('Show B on the TV');
    await flush();
    expect(timers().find((t) => t.id === 'b')?.showOnTv).toBe(true);
    expect(timers().find((t) => t.id === 'a')).not.toHaveProperty('showOnTv');
    expect(window.trifold.timers.save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Take B off the TV' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('turns the chime off and on from the row', async () => {
    seed([timer('t', 'Decide', { durationSec: 5 })]);
    render(<TimersTool />);
    press('Silence Decide at zero');
    await flush();
    expect(timers()[0]!.chime).toBe(false);
    expect(window.trifold.timers.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't', chime: false }),
    );
    press('Start Decide');
    advance(6_000);
    expect(row('Decide')).toHaveClass('status-done');
    expect(chime).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Chime when Decide ends' })).toBeInTheDocument();
  });

  it('keeps a running timer going through an edit; the new duration applies on reset', async () => {
    seed([timer('t', 'Decide', { durationSec: 60 })]);
    render(<TimersTool />);
    press('Start Decide');
    advance(10_000);
    press('Edit Decide');
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '5m' } });
    press('Save');
    await flush();
    expect(timers()[0]!.durationSec).toBe(300);
    expect(clock('Decide')).toHaveTextContent('0:50');
    press('Reset Decide to 5m');
    expect(clock('Decide')).toHaveTextContent('5:00');
  });

  it('deletes only after the inline confirm', async () => {
    seed([timer('t', 'Decide')]);
    render(<TimersTool />);
    press('Delete Decide');
    press('Keep');
    expect(window.trifold.timers.remove).not.toHaveBeenCalled();
    press('Delete Decide');
    press('Delete');
    await flush();
    expect(timers()).toHaveLength(0);
    expect(window.trifold.timers.remove).toHaveBeenCalledWith('t');
  });

  it('drops every run when another campaign opens', () => {
    seed([timer('t', 'Decide')]);
    render(<TimersTool />);
    press('Start Decide');
    advance(10_000);
    expect(useTimersStore.getState().runs['t']?.status).toBe('running');
    act(() => seed([timer('t', 'Decide')], 'c2'));
    expect(useTimersStore.getState().runs).toEqual({});
    expect(clock('Decide')).toHaveTextContent('1:00');
  });

  it('Ctrl+Alt+T style summon focuses the first timer', () => {
    seed([timer('t', 'Decide')]);
    render(<TimersTool />);
    act(() => useTimersStore.getState().summon());
    expect(screen.getByRole('button', { name: 'Start Decide' })).toHaveFocus();
    expect(useShellStore.getState().layout.dock.sections).toContainEqual({
      tool: 'timers',
      open: true,
    });
  });
});
