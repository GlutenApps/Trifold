import { act, render, screen } from '@testing-library/react';
import { initialPresenterState, type PresenterState } from '@trifold/api';
import { describe, expect, it, vi } from 'vitest';
import { PlayerScreen } from './PlayerScreen';

function mountWithPush() {
  let push: ((s: PresenterState) => void) | null = null;
  vi.mocked(window.trifold.on).mockImplementation((_event, listener) => {
    push = listener as (s: PresenterState) => void;
    return () => undefined;
  });
  render(<PlayerScreen />);
  return (s: Partial<PresenterState>) =>
    act(async () => {
      push?.({ ...initialPresenterState, blackout: false, updatedAt: Date.now(), ...s });
    });
}

describe('PlayerScreen', () => {
  it('starts blacked out and renders a title card', async () => {
    const push = mountWithPush();
    expect(screen.getByTestId('player-blackout')).toBeInTheDocument();
    await push({
      scene: { kind: 'title', id: 'a', title: 'The Sunken Keep', subtitle: 'Part one' },
    });
    expect(screen.getByRole('heading', { name: 'The Sunken Keep' })).toBeInTheDocument();
    expect(screen.getByText('Part one')).toBeInTheDocument();
  });

  it('renders a map with its visible tokens, the active ring and combat names', async () => {
    const push = mountWithPush();
    await push({
      scene: {
        kind: 'blankGrid',
        id: 'm',
        title: 'Cellar',
        width: 700,
        height: 700,
        backdrop: 'parchment',
        grid: { cellPx: 70, offsetX: 0, offsetY: 0, color: '#000', opacity: 0.3, visible: true },
        tokens: [
          {
            id: 't1',
            kind: 'creature',
            x: 1,
            y: 1,
            footprint: 1,
            label: 'Beast',
            role: 'enemy',
            dead: false,
          },
          {
            id: 't2',
            kind: 'pc',
            x: 3,
            y: 2,
            footprint: 1,
            label: 'Mira',
            role: 'ally',
            dead: false,
          },
        ],
        tokenStyle: 'engraved',
        camera: { x: 0, y: 0, width: 700, height: 700 },
      },
      combat: {
        round: 2,
        activeId: 'c1',
        entries: [
          {
            id: 'c1',
            name: 'Wolf',
            role: 'enemy',
            isPc: false,
            dead: false,
            bloodied: false,
            tokenId: 't1',
          },
          {
            id: 'c2',
            name: 'Mira',
            role: 'ally',
            isPc: true,
            dead: false,
            bloodied: false,
            tokenId: 't2',
          },
        ],
      },
    });
    const tokens = screen.getAllByTestId('player-token');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toHaveStyle({ left: '70px', top: '70px' });
    expect(tokens[0]!.querySelector('.token-disc')).toHaveClass('active');
    expect(tokens[0]!.querySelector('.token-label')).toHaveTextContent('Wolf');
    expect(screen.getByTestId('overlay-title')).toHaveTextContent('Cellar');
  });

  it('shows an image scene with its title overlay only when asked', async () => {
    const push = mountWithPush();
    const scene = {
      kind: 'image' as const,
      id: 'i',
      title: 'Gate',
      imageUrl: 'trifold-media://library/x.jpg',
      width: 10,
      height: 5,
    };
    await push({ scene, showSceneTitle: false });
    expect(screen.queryByTestId('overlay-title')).not.toBeInTheDocument();
    await push({ scene, showSceneTitle: true });
    expect(screen.getByTestId('overlay-title')).toHaveTextContent('Gate');
  });

  it('renders the initiative strip, round counter, handout and break screen', async () => {
    const push = mountWithPush();
    await push({
      scene: { kind: 'title', id: 'a', title: 'Fight' },
      combat: {
        round: 3,
        activeId: 'w',
        entries: [
          {
            id: 't',
            name: 'Thora',
            role: 'ally',
            isPc: true,
            dead: false,
            hpFraction: 0.5,
            bloodied: false,
          },
          { id: 'w', name: 'Beast', role: 'enemy', isPc: false, dead: false, bloodied: true },
        ],
      },
      overlays: {
        sceneTitle: true,
        initiativeStrip: true,
        pcHealthBars: true,
        roundCounter: true,
        counters: true,
        timers: true,
      },
      handout: { kind: 'text', title: 'Letter', body: 'Come at dusk.' },
      breakScreen: { title: 'Back in', endsAt: Date.now() + 65_000 },
    });
    const strip = screen.getByRole('list', { name: 'Initiative' });
    expect(strip).toHaveTextContent('Thora');
    expect(strip).toHaveTextContent('Beast');
    expect(strip.querySelector('.chip.active')).toHaveTextContent('Beast');
    expect(strip.querySelector('.hp-bar')).toHaveAttribute('aria-label', '50% health');
    expect(screen.getByTestId('round-counter')).toHaveTextContent('Round 3');
    expect(screen.getByTestId('handout')).toHaveTextContent('Come at dusk.');
    expect(screen.getByTestId('countdown')).toHaveTextContent(/1:0\d/);
  });

  it('shows the counters the DM put on the TV, with a maximum when set, unless switched off', async () => {
    const push = mountWithPush();
    const counters: PresenterState['counters'] = [
      { id: 'r', name: 'Ritual rounds', value: 3, max: 5, bound: null },
      { id: 't', name: 'Torches', value: 0, bound: 'min' },
    ];
    await push({ counters });
    const list = screen.getByRole('list', { name: 'Counters' });
    expect(list).toHaveTextContent('Ritual rounds3 / 5');
    expect(list).toHaveTextContent('Torches0');
    expect(screen.getByText('Torches').closest('li')).toHaveClass('at-min');
    await push({ counters, overlays: { ...initialPresenterState.overlays, counters: false } });
    expect(screen.queryByTestId('tv-counters')).not.toBeInTheDocument();
  });
  it('counts the TV timer down on its own clock, alerts at zero, and hides with its switch', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T12:00:00.000Z') });
    try {
      const push = mountWithPush();
      const endsAt = Date.now() + 65_000;
      const timer = { id: 't', name: 'Decide', status: 'running' as const, endsAt, leftMs: 65_000 };
      await push({ timer });
      const card = screen.getByTestId('tv-timer');
      expect(card).toHaveTextContent('Decide1:05');
      // No push from the console: the player window keeps time itself.
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(card).toHaveTextContent('0:05');
      await act(async () => {
        vi.advanceTimersByTime(5_500);
      });
      expect(screen.getByTestId('tv-timer')).toHaveClass('status-done');
      expect(screen.getByTestId('tv-timer')).toHaveTextContent('0:00Time’s up');
      // Paused: the time left, standing still.
      await push({ timer: { id: 't', name: 'Decide', status: 'paused', leftMs: 42_000 } });
      expect(screen.getByTestId('tv-timer')).toHaveTextContent('0:42');
      await push({
        timer: { id: 't', name: 'Decide', status: 'paused', leftMs: 42_000 },
        overlays: { ...initialPresenterState.overlays, timers: false },
      });
      expect(screen.queryByTestId('tv-timer')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
