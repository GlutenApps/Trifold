import { useState } from 'react';
import { mediaUrl, type PresenterOverlays } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';

export const OVERLAY_LABELS: { [K in keyof PresenterOverlays]: string } = {
  sceneTitle: 'Scene title',
  initiativeStrip: 'Initiative strip',
  pcHealthBars: 'PC health bars',
  roundCounter: 'Round counter',
};

/**
 * What goes on the TV besides the live scene: undo, overlays, handouts and the break screen.
 * Blackout and the player window toggle sit inline in the tray, so they are not repeated here.
 */
export function TvControls() {
  const presenter = usePresenterStore();
  const slug = useCampaignStore((s) => s.current?.campaign.slug ?? '');
  const importSceneImage = useCampaignStore((s) => s.importSceneImage);
  const [handoutTitle, setHandoutTitle] = useState('');
  const [handoutBody, setHandoutBody] = useState('');
  const [breakTitle, setBreakTitle] = useState('Back in a few minutes');
  const [breakMinutes, setBreakMinutes] = useState('10');
  const live = presenter.state;
  const playerOpen = useAppStore((s) => s.playerOpen);
  const openPlayer = useAppStore((s) => s.openPlayer);
  const closePlayer = useAppStore((s) => s.closePlayer);
  const isLive = !!live.scene && !live.blackout;

  return (
    <div className="tv-controls">
      <div className={`card live-card${isLive ? ' live' : ''}`} data-testid="tv-live-card">
        <div className="row">
          <span className="muted small">
            {isLive ? 'Live on TV' : live.blackout ? 'Blackout' : 'Nothing live'}
          </span>
          <span className="spacer" />
          <span className="badge">{playerOpen ? 'window open' : 'window closed'}</span>
        </div>
        <strong>{live.scene?.title ?? '—'}</strong>
        {live.scene && (
          <span className="muted small">
            {' '}
            · {live.scene.kind}
            {live.handout ? ' · handout' : ''}
            {live.breakScreen ? ' · break' : ''}
          </span>
        )}
      </div>
      <div className="row">
        <button
          type="button"
          className={`btn small${live.blackout ? ' primary' : ''}`}
          aria-pressed={live.blackout}
          onClick={presenter.toggleBlackout}
          title="Ctrl+Shift+B"
        >
          Blackout
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => void (playerOpen ? closePlayer() : openPlayer())}
          title="Ctrl+Shift+P"
        >
          {playerOpen ? 'Close player window' : 'Open player window'}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={presenter.history.length === 0}
          onClick={presenter.undo}
        >
          Undo last scene
        </button>
        {live.handout && (
          <button type="button" className="btn" onClick={presenter.clearHandout}>
            Dismiss handout
          </button>
        )}
        {live.breakScreen && (
          <button type="button" className="btn" onClick={presenter.clearBreak}>
            End break
          </button>
        )}
      </div>
      <div className="row">
        {(Object.keys(OVERLAY_LABELS) as Array<keyof PresenterOverlays>).map((key) => (
          <label key={key} className="field inline">
            <input
              type="checkbox"
              checked={live.overlays[key]}
              onChange={(e) => presenter.setOverlay(key, e.target.checked)}
            />
            {OVERLAY_LABELS[key]}
          </label>
        ))}
      </div>
      <h2 className="mt">Handout</h2>
      <div className="row">
        <input
          type="text"
          aria-label="Handout title"
          placeholder="title"
          value={handoutTitle}
          onChange={(e) => setHandoutTitle(e.target.value)}
        />
        <input
          type="text"
          aria-label="Handout text"
          placeholder="text"
          value={handoutBody}
          onChange={(e) => setHandoutBody(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={!handoutTitle.trim() && !handoutBody.trim()}
          onClick={() =>
            presenter.showHandout({
              kind: 'text',
              title: handoutTitle.trim(),
              body: handoutBody.trim(),
            })
          }
        >
          Show text handout
        </button>
        <button
          type="button"
          className="btn"
          disabled={!slug}
          onClick={() => {
            void importSceneImage().then((image) => {
              if (image)
                presenter.showHandout({
                  kind: 'image',
                  url: mediaUrl(slug, image.displayPath),
                  ...(handoutTitle.trim() ? { title: handoutTitle.trim() } : {}),
                });
            });
          }}
        >
          Show image handout…
        </button>
      </div>
      <h2 className="mt">Break</h2>
      <div className="row">
        <input
          type="text"
          aria-label="Break title"
          value={breakTitle}
          onChange={(e) => setBreakTitle(e.target.value)}
        />
        <input
          type="number"
          aria-label="Break minutes"
          className="narrow"
          value={breakMinutes}
          onChange={(e) => setBreakMinutes(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          onClick={() =>
            presenter.showBreak(
              breakTitle.trim() || 'Break',
              undefined,
              Number(breakMinutes) || undefined,
            )
          }
        >
          Show break screen
        </button>
      </div>
    </div>
  );
}
