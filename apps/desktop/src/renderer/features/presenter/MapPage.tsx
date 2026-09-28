import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { isMapScene, useSceneStore } from '../../stores/sceneStore';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from '../shell/icons';
import { createScene } from './createScene';
import { MapEditor } from './MapEditor';
import { activeBackgroundOf, backgroundsOf } from './mapMath';

/**
 * The Map major (ADR 0004 §3.3): the selected map or blank-grid scene on a canvas with its tool
 * strip. Selection comes from the Scenes tool; Send to TV is here too.
 */
export function MapPage() {
  const slug = useCampaignStore((s) => s.current?.campaign.slug ?? '');
  const hasCampaign = useCampaignStore((s) => !!s.current);
  const draft = useSceneStore((s) => s.draft);
  const setDraft = useSceneStore((s) => s.setDraft);
  const send = useSceneStore((s) => s.send);
  const liveId = usePresenterStore((s) => s.state.scene?.id ?? null);
  const blackout = usePresenterStore((s) => s.state.blackout);
  const openTool = useShellStore((s) => s.openTool);

  if (!hasCampaign) return <p className="muted">Open a campaign first.</p>;

  if (!draft || !isMapScene(draft)) {
    return (
      <section className="map-empty">
        <p className="muted">
          {draft
            ? `"${draft.title}" is a ${draft.kind === 'title' ? 'title card' : draft.kind}. Select a map or blank grid in Scenes to edit it here.`
            : 'Select a map or blank grid in Scenes to edit it here.'}
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void createScene('map', '')}>
            New map…
          </button>
          <button type="button" className="btn" onClick={() => void createScene('blankGrid', '')}>
            New blank grid
          </button>
          <button type="button" className="btn small" onClick={() => openTool('scenes')}>
            Open Scenes
          </button>
        </div>
      </section>
    );
  }

  const isLive = draft.id === liveId && !blackout;
  const grid = draft.grid ? `${Math.round(draft.grid.cellPx)} px grid` : 'no grid';
  return (
    <section className="map-page">
      <header className="row map-head">
        <Icon name={draft.kind === 'map' ? 'map' : 'grid'} size={15} />
        <strong className="map-title">{draft.title}</strong>
        {isLive && <span className="badge roll">live</span>}
        <span className="muted small">
          {grid} · {draft.tokens.length} tokens
          {backgroundsOf(draft).length > 1 && ` · ${activeBackgroundOf(draft)?.name ?? ''}`}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="btn small primary"
          disabled={isLive}
          onClick={() => send(draft)}
        >
          Send to TV
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Edit scene"
          title="Edit scene in Scenes"
          onClick={() => openTool('scenes')}
        >
          <Icon name="pencil" size={15} />
        </button>
      </header>
      <MapEditor scene={draft} slug={slug} onChange={setDraft} />
    </section>
  );
}
