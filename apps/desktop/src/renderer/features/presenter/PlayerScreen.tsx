import { useEffect, useState } from 'react';
import { initialPresenterState, type PresenterState } from '@trifold/api';
import { MapLayer } from './MapLayer';

function Countdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.round((endsAt - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <p className="countdown" data-testid="countdown">
      {remaining === 0 ? 'Time to play' : `${m}:${s.toString().padStart(2, '0')}`}
    </p>
  );
}

/**
 * The player window (DESIGN.md §6.5). A pure view of the state main pushes to it: it never
 * mutates state and never reads the Library. Scenes crossfade; overlays sit on top.
 */
export function PlayerScreen() {
  const [state, setState] = useState<PresenterState>(initialPresenterState);

  useEffect(() => {
    let alive = true;
    const accept = (s: PresenterState) =>
      setState((current) => (s.updatedAt >= current.updatedAt ? s : current));
    void window.trifold.presenter.get().then((s) => {
      if (alive) accept(s);
    });
    const off = window.trifold.on('presenterState', accept);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (state.blackout) return <div className="player" data-testid="player-blackout" />;

  const { scene, combat, overlays } = state;
  return (
    <div className="player">
      {scene && (
        <div
          key={scene.id}
          className={`scene-layer scene-${scene.kind} backdrop-${scene.kind === 'title' ? (scene.backdrop ?? 'dark') : 'dark'}`}
        >
          {scene.kind === 'title' && (
            <div className="title-card">
              <h1>{scene.title}</h1>
              {scene.subtitle && <p>{scene.subtitle}</p>}
            </div>
          )}
          {scene.kind === 'image' && (
            <img
              className="scene-image"
              src={scene.imageUrl}
              alt=""
              width={scene.width}
              height={scene.height}
            />
          )}
          {(scene.kind === 'map' || scene.kind === 'blankGrid') && (
            <MapLayer scene={scene} combat={combat} />
          )}
        </div>
      )}
      {!scene && <div className="scene-layer backdrop-dark" data-testid="player-empty" />}

      {scene && scene.kind !== 'title' && state.showSceneTitle && (
        <div className="overlay-title" data-testid="overlay-title">
          {scene.title}
        </div>
      )}

      {combat && overlays.initiativeStrip && (
        <ol className="initiative-strip" aria-label="Initiative">
          {combat.entries.map((e) => (
            <li
              key={e.id}
              className={`chip role-${e.role}${e.id === combat.activeId ? ' active' : ''}${e.dead ? ' dead' : ''}${e.bloodied ? ' bloodied' : ''}`}
            >
              <span className="chip-name">{e.name}</span>
              {e.hpFraction !== undefined && overlays.pcHealthBars && (
                <span className="hp-bar" aria-label={`${Math.round(e.hpFraction * 100)}% health`}>
                  <span
                    className="hp-fill"
                    style={{ width: `${Math.round(e.hpFraction * 100)}%` }}
                  />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {combat && overlays.roundCounter && combat.round > 0 && (
        <div className="round-counter" data-testid="round-counter">
          Round {combat.round}
        </div>
      )}

      {state.handout && (
        <div className="handout" data-testid="handout">
          {state.handout.kind === 'text' ? (
            <div className="handout-card">
              <h2>{state.handout.title}</h2>
              <p>{state.handout.body}</p>
            </div>
          ) : (
            <img
              className="handout-image"
              src={state.handout.url}
              alt={state.handout.title ?? 'Handout'}
            />
          )}
        </div>
      )}

      {state.breakScreen && (
        <div className="break-screen" data-testid="break-screen">
          <h1>{state.breakScreen.title}</h1>
          {state.breakScreen.subtitle && <p>{state.breakScreen.subtitle}</p>}
          {state.breakScreen.endsAt !== undefined && (
            <Countdown endsAt={state.breakScreen.endsAt} />
          )}
        </div>
      )}
    </div>
  );
}
