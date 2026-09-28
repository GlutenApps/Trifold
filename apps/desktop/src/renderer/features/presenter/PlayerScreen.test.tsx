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
      overlays: { sceneTitle: true, initiativeStrip: true, pcHealthBars: true, roundCounter: true },
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
});
