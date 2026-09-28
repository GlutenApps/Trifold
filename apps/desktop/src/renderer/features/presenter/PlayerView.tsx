import { useEffect, useState } from 'react';
import { initialPresenterState, type PresenterState } from '@trifold/api';

/**
 * The player window. A pure view of the state main pushes to it (DESIGN.md §4.1): it never
 * mutates state and never reads the Library.
 */
export function PlayerView() {
  const [state, setState] = useState<PresenterState>(initialPresenterState);

  useEffect(() => {
    let alive = true;
    void window.trifold.presenter.get().then((s) => {
      if (alive) setState((current) => (s.updatedAt >= current.updatedAt ? s : current));
    });
    const off = window.trifold.on('presenterState', (s) => {
      setState((current) => (s.updatedAt >= current.updatedAt ? s : current));
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (state.blackout || !state.scene) {
    return <div className="player" data-testid="player-blackout" />;
  }

  return (
    <div className="player">
      <div className="title-card">
        <h1>{state.scene.title}</h1>
        {state.scene.subtitle && <p>{state.scene.subtitle}</p>}
      </div>
    </div>
  );
}
