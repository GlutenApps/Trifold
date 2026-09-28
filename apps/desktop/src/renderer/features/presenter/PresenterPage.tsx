import { useState } from 'react';
import type { PresenterOverlays } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { usePresenterStore } from '../../stores/presenterStore';

const OVERLAY_LABELS: { [K in keyof PresenterOverlays]: string } = {
  sceneTitle: 'Scene title',
  initiativeStrip: 'Initiative strip',
  pcHealthBars: 'PC health bars',
  roundCounter: 'Round counter',
};

export function PresenterPage() {
  const playerOpen = useAppStore((s) => s.playerOpen);
  const openPlayer = useAppStore((s) => s.openPlayer);
  const closePlayer = useAppStore((s) => s.closePlayer);
  const state = usePresenterStore((s) => s.state);
  const canUndo = usePresenterStore((s) => s.history.length > 0);
  const showTitleCard = usePresenterStore((s) => s.showTitleCard);
  const toggleBlackout = usePresenterStore((s) => s.toggleBlackout);
  const setOverlay = usePresenterStore((s) => s.setOverlay);
  const undo = usePresenterStore((s) => s.undo);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  return (
    <section>
      <h1>Presenter</h1>

      <div className="card">
        <h2>Player window</h2>
        <div className="row">
          <span>Status: {playerOpen ? 'open' : 'closed'}</span>
          {playerOpen ? (
            <button type="button" className="btn" onClick={() => void closePlayer()}>
              Close player window
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => void openPlayer()}>
              Open player window
            </button>
          )}
          <button
            type="button"
            className="btn"
            aria-pressed={state.blackout}
            onClick={toggleBlackout}
          >
            Blackout
          </button>
          <button type="button" className="btn" disabled={!canUndo} onClick={undo}>
            Undo last scene
          </button>
        </div>
        <p className="muted">
          Live: {state.blackout ? 'blackout' : state.scene ? state.scene.title : 'nothing'}
        </p>
      </div>

      <div className="card">
        <h2>Title card</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const t = title.trim();
            if (!t) return;
            showTitleCard(t, subtitle.trim() || undefined);
          }}
        >
          <label>
            Title
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Subtitle
            <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </label>
          <button type="submit" className="btn primary">
            Send to TV
          </button>
        </form>
        <p className="muted">
          Image, map and blank-grid scenes, the scene tree and tokens arrive in M1.
        </p>
      </div>

      <div className="card">
        <h2>Overlays</h2>
        {(Object.keys(OVERLAY_LABELS) as Array<keyof PresenterOverlays>).map((key) => (
          <label key={key} className="row">
            <input
              type="checkbox"
              checked={state.overlays[key]}
              onChange={(e) => setOverlay(key, e.target.checked)}
            />
            {OVERLAY_LABELS[key]}
          </label>
        ))}
      </div>
    </section>
  );
}
