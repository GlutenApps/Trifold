import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { initialPresenterState, type PresenterState } from '@trifold/api';
import { PlayerView } from './PlayerView';

describe('PlayerView', () => {
  it('starts blacked out and renders a pushed title card', async () => {
    let push: ((s: PresenterState) => void) | null = null;
    vi.mocked(window.trifold.on).mockImplementation((_event, listener) => {
      push = listener as (s: PresenterState) => void;
      return () => undefined;
    });

    render(<PlayerView />);
    expect(screen.getByTestId('player-blackout')).toBeInTheDocument();

    await act(async () => {
      push?.({
        ...initialPresenterState,
        blackout: false,
        scene: { kind: 'title', id: 'x', title: 'The Sunken Keep', subtitle: 'Part one' },
        updatedAt: 10,
      });
    });
    expect(screen.getByRole('heading', { name: 'The Sunken Keep' })).toBeInTheDocument();
    expect(screen.getByText('Part one')).toBeInTheDocument();
  });

  it('ignores stale updates', async () => {
    let push: ((s: PresenterState) => void) | null = null;
    vi.mocked(window.trifold.on).mockImplementation((_event, listener) => {
      push = listener as (s: PresenterState) => void;
      return () => undefined;
    });
    render(<PlayerView />);
    await act(async () => {
      push?.({
        ...initialPresenterState,
        blackout: false,
        scene: { kind: 'title', id: 'a', title: 'Newer' },
        updatedAt: 20,
      });
      push?.({
        ...initialPresenterState,
        blackout: false,
        scene: { kind: 'title', id: 'b', title: 'Older' },
        updatedAt: 5,
      });
    });
    expect(screen.getByRole('heading', { name: 'Newer' })).toBeInTheDocument();
  });
});
