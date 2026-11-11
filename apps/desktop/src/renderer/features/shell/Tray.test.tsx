import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { CampaignCounter, CampaignTimer, TrayItem } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCountersStore } from '../../stores/countersStore';
import { discardPendingSaves } from '../../stores/pendingSaves';
import { useShellStore } from '../../stores/shellStore';
import { defaultLayout } from '../../stores/shellLayout';
import { useTimersStore } from '../../stores/timersStore';
import { LiveStrip } from './LiveStrip';
import { Pop } from './Pop';

/** The tray (ADR 0023): the DM chooses up to four sections; Dice is always there. */

const at = '2026-11-10T12:00:00.000Z';

const timer = (id: string, name: string, order = 0): CampaignTimer => ({
  schemaVersion: 1,
  id,
  name,
  durationSec: 90,
  chime: false,
  order,
  createdAt: at,
  updatedAt: at,
});

const counter = (id: string, name: string, order = 0): CampaignCounter => ({
  schemaVersion: 1,
  id,
  name,
  initial: 3,
  value: 3,
  step: 1,
  min: 0,
  max: 3,
  order,
  createdAt: at,
  updatedAt: at,
});

function seed(timers: CampaignTimer[], counters: CampaignCounter[]) {
  useCampaignStore.setState({
    current: {
      campaign: { schemaVersion: 1, id: 'c1', slug: 'c', name: 'C', settings: {} },
      pcs: [],
      adventures: [],
      notes: [],
      npcs: [],
      encounters: [],
      scenes: [],
      timers,
      counters,
    } as unknown as CampaignBundle,
  });
}

function setTray(tray: TrayItem[]) {
  useShellStore.setState({ layout: { ...defaultLayout(), tray } });
}

const strip = () => screen.getByTestId('live-strip');
const sections = () =>
  Array.from(strip().querySelectorAll<HTMLElement>('[data-strip]')).map((el) => el.dataset.strip);

function openChooser() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose what the tray shows' }));
  return screen.getByRole('dialog', { name: 'Tray' });
}

describe('tray', () => {
  beforeEach(() => {
    useShellStore.setState({
      space: 'console',
      campaignSlug: 'c',
      layout: defaultLayout(),
      flyout: null,
      pop: null,
      viewportWidth: 1600,
    });
    useTimersStore.setState({ runs: {}, error: null });
    seed(
      [timer('01T1', 'Guards return'), timer('01T2', 'Ritual', 1)],
      [counter('01C1', 'Torches')],
    );
  });

  afterEach(() => discardPendingSaves());

  it('shows VTT, Music and Encounters by default, then the chooser and Dice', () => {
    render(<LiveStrip />);
    expect(sections()).toEqual(['tv', 'music', 'combat', 'choose', 'dice']);
  });

  it('chooses sections from the pop-up, up to four, and says why a box is disabled', () => {
    render(
      <>
        <LiveStrip />
        <Pop />
      </>,
    );
    const pop = openChooser();
    expect(within(pop).getByTestId('tray-count')).toHaveTextContent('3 of 4');

    fireEvent.click(within(pop).getByRole('checkbox', { name: 'Music' }));
    expect(sections()).toEqual(['tv', 'combat', 'choose', 'dice']);

    fireEvent.click(within(pop).getByRole('checkbox', { name: 'Torches' }));
    fireEvent.click(within(pop).getByRole('checkbox', { name: 'Ritual' }));
    // Built-ins, then counters, then timers, whatever order they were ticked in.
    expect(sections()).toEqual(['tv', 'combat', 'counter', 'timer', 'choose', 'dice']);
    expect(within(pop).getByTestId('tray-count')).toHaveTextContent('4 of 4');

    const music = within(pop).getByRole('checkbox', { name: 'Music' });
    expect(music).toBeDisabled();
    expect(music.closest('label')).toHaveAttribute('title', 'The tray holds 4; uncheck one first');
    expect(within(pop).getByRole('checkbox', { name: 'Guards return' })).toBeDisabled();
    expect(within(pop).getByRole('checkbox', { name: 'Ritual' })).toBeEnabled();
  });

  it('says when the campaign has no timers or counters', () => {
    seed([], []);
    render(
      <>
        <LiveStrip />
        <Pop />
      </>,
    );
    const pop = openChooser();
    expect(within(pop).getByText('No timers in this campaign.')).toBeInTheDocument();
    expect(within(pop).getByText('No counters in this campaign.')).toBeInTheDocument();
  });

  it('can hide everything but Dice', () => {
    setTray([]);
    render(<LiveStrip />);
    expect(sections()).toEqual(['choose', 'dice']);
  });

  it('changes a counter from the tray and marks a bound', () => {
    setTray(['counter:01C1']);
    render(<LiveStrip />);
    const sec = strip().querySelector<HTMLElement>('[data-strip="counter"]')!;
    expect(sec).toHaveClass('at-max');
    fireEvent.click(within(sec).getByRole('button', { name: 'Take 1 from Torches (tray)' }));
    expect(useCampaignStore.getState().current!.counters[0]!.value).toBe(2);
    expect(sec).toHaveTextContent('2');
    expect(sec).not.toHaveClass('at-max');
  });

  it('starts, pauses and resets a timer from the tray', () => {
    setTray(['timer:01T1']);
    render(<LiveStrip />);
    const sec = strip().querySelector<HTMLElement>('[data-strip="timer"]')!;
    expect(sec).toHaveTextContent('1:30');
    fireEvent.click(within(sec).getByRole('button', { name: 'Start Guards return (tray)' }));
    expect(useTimersStore.getState().runs['01T1']?.status).toBe('running');
    fireEvent.click(within(sec).getByRole('button', { name: 'Pause Guards return (tray)' }));
    expect(useTimersStore.getState().runs['01T1']?.status).toBe('paused');
    fireEvent.click(
      within(sec).getByRole('button', { name: 'Reset Guards return to 1m 30s (tray)' }),
    );
    expect(useTimersStore.getState().runs['01T1']).toBeUndefined();
    expect(
      within(sec).getByRole('button', { name: 'Reset Guards return to 1m 30s (tray)' }),
    ).toBeDisabled();
  });

  it("drops another campaign's timers and counters, keeping the built-in sections", () => {
    setTray(['map', 'timer:01GONE', 'counter:01C1']);
    render(<LiveStrip />);
    expect(useShellStore.getState().layout.tray).toEqual(['map', 'counter:01C1']);
  });

  it('takes a deleted counter off the tray and out of saved layouts', async () => {
    setTray(['map', 'counter:01C1']);
    useShellStore.setState({
      presets: [{ name: 'Mine', layout: { ...defaultLayout(), tray: ['counter:01C1'] } }],
    });
    render(<LiveStrip />);
    await act(() => useCountersStore.getState().remove('01C1'));
    expect(useShellStore.getState().layout.tray).toEqual(['map']);
    expect(useShellStore.getState().presets[0]!.layout.tray).toEqual([]);
    expect(vi.mocked(window.trifold.counters.remove)).toHaveBeenCalledWith('01C1');
  });
});
