import { useState } from 'react';
import { mediaUrl, type PresenterOverlays } from '@trifold/api';
import type { Scene } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { toggleLive } from '../../stores/live';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { isMapScene, useSceneStore } from '../../stores/sceneStore';
import { useShellStore } from '../../stores/shellStore';
import { hk } from '../../platform';
import { Icon } from '../shell/icons';
import { createScene } from './createScene';
import { MapEditor } from './MapEditor';
import { MapPop } from './MapPop';
import { PlayerDevicesPop } from '../players/PlayerDevices';
import { flattenTree, showableAt } from './sceneTree';

/**
 * The TV tab, the stage major under the `map` key (ADR 0008): the one screen where the DM sees
 * and shapes a scene and sends it. This file holds the page, its scene picker, the control bar
 * and the preview for non-map scenes; `TvPage` below has the detail. Maps hand off to MapEditor.
 */

/** Every overlay toggle the TV offers, in the order the Overlays pop-up lists them. */
const OVERLAY_LABELS: { [K in keyof PresenterOverlays]: string } = {
  sceneTitle: 'Scene title',
  initiativeStrip: 'Initiative strip',
  pcHealthBars: 'PC health bars',
  roundCounter: 'Round counter',
  counters: 'Counters',
  timers: 'Timers',
};

type Pop = 'overlays' | 'break' | 'players';

/**
 * The TV major (ADR 0008): the screen. It shows the selected scene of any kind (or the live one
 * when nothing is selected), with the map editor for maps and blank grids, and carries every
 * control for what is on the TV, in the order a DM needs them: the TV itself (a red on-air
 * tally while the window is open), what to show (Send to TV, Blackout, Break) as text buttons,
 * then the tools (undo, overlays) as icons. The live strip mirrors the one-tap ones; nothing
 * lives only there. Handouts are parked: the player still renders them but the console has no
 * control for them yet.
 */
export function TvPage() {
  const slug = useCampaignStore((s) => s.current?.campaign.slug ?? '');
  const hasCampaign = useCampaignStore((s) => !!s.current);
  const scenes = useCampaignStore((s) => s.current?.scenes);
  const draft = useSceneStore((s) => s.draft);
  const select = useSceneStore((s) => s.select);
  const setDraft = useSceneStore((s) => s.setDraft);
  const live = usePresenterStore((s) => s.state);
  const openTool = useShellStore((s) => s.openTool);

  if (!hasCampaign) return <p className="muted">Open a campaign first.</p>;

  const liveId = live.scene?.id ?? null;
  const liveStored = liveId ? (scenes?.find((s) => s.id === liveId) ?? null) : null;
  const shown: Scene | null = draft ?? liveStored;
  // On air: the active scene, while live and not blacked out (ADR 0046).
  const isLive = !!shown && shown.id === liveId && live.live && !live.blackout;
  const isActive = !!shown && shown.id === liveId && !live.live;

  return (
    <section className="map-page tv-page" data-testid="tv-page">
      <header className="row map-head tv-head">
        <ScenePicker
          scenes={scenes ?? []}
          shown={shown}
          liveId={liveId}
          onAir={live.live}
          blackout={live.blackout}
        />
        {shown ? (
          <>
            {isLive && <span className="badge live">live</span>}
            {isActive && <span className="badge">active</span>}
            {live.scene && shown.id !== liveId && liveStored && (
              <button
                type="button"
                className="link small"
                title="Show the active scene"
                onClick={() => select(liveStored.id)}
              >
                Active: {liveStored.title}
              </button>
            )}
          </>
        ) : (
          <span className="muted small" data-testid="tv-status">
            {live.live ? 'No active scene' : 'Not live'}
          </span>
        )}
        <span className="spacer" />
        <TvControls shown={shown} />
      </header>
      {!shown && <EmptyState onOpenScenes={() => openTool('scenes')} />}
      {shown && isMapScene(shown) && (
        <MapEditor
          scene={shown}
          slug={slug}
          onChange={(next) => {
            if (!draft) select(next.id);
            setDraft(next);
          }}
        />
      )}
      {shown && !isMapScene(shown) && <ScenePreview scene={shown} slug={slug} />}
    </section>
  );
}

/**
 * Previous / next and a jump list over the prepared scenes. Selecting here never sends: the DM
 * steps to a scene, adjusts it, then presses Send to TV. Adding and editing stay in Scenes.
 */
function ScenePicker({
  scenes,
  shown,
  liveId,
  onAir,
  blackout,
}: {
  scenes: readonly Scene[];
  shown: Scene | null;
  liveId: string | null;
  onAir: boolean;
  blackout: boolean;
}) {
  const select = useSceneStore((s) => s.select);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const rows = flattenTree(scenes);
  const previous = showableAt(scenes, shown, -1);
  const next = showableAt(scenes, shown, 1);
  const go = (scene: Scene) => {
    select(scene.id);
    close();
  };
  return (
    <span className="row scene-picker" role="group" aria-label="Scene">
      <MapPop
        open={open}
        onClose={close}
        label="Jump to scene"
        side="down-left"
        trigger={
          <button
            type="button"
            className="btn scene-pick"
            aria-haspopup="listbox"
            aria-expanded={open}
            title="Jump to a scene you have set up"
            onClick={() => setOpen((v) => !v)}
          >
            {shown ? (
              <>
                <Icon name={kindIcon(shown)} />
                <strong data-testid="tv-title">{shown.title}</strong>
              </>
            ) : (
              <span className="muted">Pick a scene</span>
            )}
            <Icon name="down" />
          </button>
        }
      >
        <div className="scene-pick-list" role="listbox" aria-label="Scenes">
          {rows.length === 0 && <p className="muted">No scenes yet. Add some in Scenes.</p>}
          {rows.map(({ scene, depth }) =>
            scene.kind === 'folder' ? (
              <div
                key={scene.id}
                className="scene-pick-folder"
                style={{ paddingLeft: 8 + depth * 14 }}
              >
                {scene.title}
              </div>
            ) : (
              <div
                key={scene.id}
                role="option"
                tabIndex={0}
                aria-selected={scene.id === shown?.id}
                className="scene-pick-row"
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => go(scene)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go(scene);
                  }
                }}
              >
                <Icon name={kindIcon(scene)} size={14} />
                <span className="scene-pick-name">{scene.title}</span>
                {scene.id === liveId && onAir && !blackout && (
                  <span className="badge live">live</span>
                )}
                {scene.id === liveId && !onAir && <span className="badge">active</span>}
              </div>
            ),
          )}
        </div>
      </MapPop>
      <span className="icon-toolbar" role="group" aria-label="Step scenes">
        <button
          type="button"
          className="chrome-btn"
          aria-label="Previous scene"
          title={`Previous scene (${hk('Ctrl+Alt+ArrowUp')})`}
          disabled={!previous || !shown}
          onClick={() => previous && go(previous)}
        >
          <Icon name="up" />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Next scene"
          title={`Next scene (${hk('Ctrl+Alt+ArrowDown')})`}
          disabled={!next || !shown}
          onClick={() => next && go(next)}
        >
          <Icon name="down" />
        </button>
      </span>
    </span>
  );
}

/** Go live, what to show (Set active scene, Blackout, Break) and the tools (undo, overlays). */
function TvControls({ shown }: { shown: Scene | null }) {
  const presenter = usePresenterStore();
  const live = presenter.state;
  const send = useSceneStore((s) => s.send);
  const playerOpen = useAppStore((s) => s.playerOpen);
  const [pop, setPop] = useState<Pop | null>(null);
  const [breakTitle, setBreakTitle] = useState('Back in a few minutes');
  const [breakMinutes, setBreakMinutes] = useState('10');
  const closePop = () => setPop(null);
  const togglePop = (next: Pop) => setPop((p) => (p === next ? null : next));
  const overlayCount = Object.values(live.overlays).filter(Boolean).length;
  const canSend = !!shown && shown.kind !== 'folder';
  // The shown scene is the active one, even behind a blackout or before going live: it can be
  // cleared, not set again.
  const onTv = !!shown && shown.id === live.scene?.id;

  return (
    <>
      <button
        type="button"
        className={`btn tv-power${live.live ? ' tally' : ''}`}
        aria-pressed={live.live}
        title={
          live.live
            ? `Live: the ${playerOpen ? 'TV and phones show' : 'phones show'} the active scene. Click to end (${hk('Ctrl+Shift+P')})`
            : `Go live: the TV opens on a second display and phones see the table (${hk('Ctrl+Shift+P')})`
        }
        onClick={() => void toggleLive()}
      >
        {live.live && <span className="tally-dot" aria-hidden="true" />}
        {live.live ? 'End live' : 'Go live'}
      </button>
      <span className="row tv-show" role="group" aria-label="Active scene">
        {onTv ? (
          <button
            type="button"
            className="btn"
            title={`Clear the active scene; overlays stay up (${hk('Ctrl+Shift+X')})`}
            onClick={presenter.clearScene}
          >
            Clear active scene
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            disabled={!canSend}
            title={
              !canSend
                ? 'Select a scene first'
                : live.live
                  ? 'Show the selected scene on the TV and phones (Enter in Scenes)'
                  : 'Make the selected scene the one that shows when you go live (Enter in Scenes)'
            }
            onClick={() => shown && send(shown)}
          >
            Set active scene
          </button>
        )}
        <button
          type="button"
          className={`btn${live.blackout && live.scene ? ' primary' : ''}`}
          aria-label="Blackout the TV"
          aria-pressed={live.blackout && !!live.scene}
          disabled={!live.scene}
          title={
            live.scene
              ? `Black the TV out; press again to bring the scene back (${hk('Ctrl+Shift+B')})`
              : 'Nothing is on the TV to black out'
          }
          onClick={presenter.toggleBlackout}
        >
          Blackout
        </button>
        {live.breakScreen ? (
          <button
            type="button"
            className="btn tally"
            title="Take the break screen down"
            onClick={presenter.clearBreak}
          >
            End break
          </button>
        ) : (
          <MapPop
            open={pop === 'break'}
            onClose={closePop}
            label="Break"
            side="down"
            trigger={
              <button
                type="button"
                className={`btn${pop === 'break' ? ' on' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={pop === 'break'}
                title="Show a break screen with a countdown"
                onClick={() => togglePop('break')}
              >
                Break…
              </button>
            }
          >
            <h3>Break</h3>
            <div className="map-pop-fields">
              <label className="field">
                Title
                <input
                  type="text"
                  aria-label="Break title"
                  value={breakTitle}
                  onChange={(e) => setBreakTitle(e.target.value)}
                />
              </label>
              <label className="field">
                Minutes
                <input
                  type="number"
                  aria-label="Break minutes"
                  className="narrow"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                presenter.showBreak(
                  breakTitle.trim() || 'Break',
                  undefined,
                  Number(breakMinutes) || undefined,
                );
                closePop();
              }}
            >
              Show break screen
            </button>
          </MapPop>
        )}
      </span>

      <span className="icon-toolbar" role="group" aria-label="TV tools">
        <button
          type="button"
          className="chrome-btn"
          aria-label="Undo the last scene"
          title={`Undo last scene (${hk('Ctrl+Shift+Z')})`}
          disabled={presenter.history.length === 0}
          onClick={presenter.undo}
        >
          <Icon name="undo" />
        </button>
        <MapPop
          open={pop === 'overlays'}
          onClose={closePop}
          label="Overlays"
          side="down"
          trigger={
            <button
              type="button"
              className={`chrome-btn${pop === 'overlays' ? ' on' : ''}`}
              aria-label="Overlays"
              aria-haspopup="dialog"
              aria-expanded={pop === 'overlays'}
              title={`Overlays on the TV (${overlayCount} on)`}
              onClick={() => togglePop('overlays')}
            >
              <Icon name="layers" />
            </button>
          }
        >
          <h3>Overlays</h3>
          <div className="map-pop-fields">
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
        </MapPop>
        <PlayerDevicesPop
          open={pop === 'players'}
          onToggle={() => togglePop('players')}
          onClose={closePop}
        />
      </span>
    </>
  );
}

/** A title card or image as the TV will show it, scaled into the tab. */
function ScenePreview({ scene, slug }: { scene: Scene; slug: string }) {
  if (scene.kind === 'folder') {
    return (
      <section className="map-empty">
        <p className="muted">
          &ldquo;{scene.title}&rdquo; is a folder. Select a scene inside it to see it here.
        </p>
      </section>
    );
  }
  const backdrop = scene.kind === 'title' ? (scene.backdrop ?? 'dark') : 'dark';
  return (
    <div className={`tv-preview backdrop-${backdrop}`} data-testid="tv-preview">
      {scene.kind === 'title' && (
        <div className="tv-preview-title">
          <strong>{scene.title}</strong>
          {scene.subtitle && <span>{scene.subtitle}</span>}
        </div>
      )}
      {scene.kind === 'image' &&
        (scene.image ? (
          <img className="tv-preview-image" src={mediaUrl(slug, scene.image.displayPath)} alt="" />
        ) : (
          <p className="muted">No image yet. Edit the scene in Scenes to add one.</p>
        ))}
    </div>
  );
}

function EmptyState({ onOpenScenes }: { onOpenScenes(): void }) {
  return (
    <section className="map-empty">
      <p className="muted">Select a scene in Scenes to see it here, or start a new one.</p>
      <div className="row">
        <button type="button" className="btn" onClick={() => void createScene('map', '')}>
          New map…
        </button>
        <button type="button" className="btn" onClick={() => void createScene('blankGrid', '')}>
          New blank grid
        </button>
        <button type="button" className="btn" onClick={onOpenScenes}>
          Open Scenes
        </button>
      </div>
    </section>
  );
}

function kindIcon(scene: Scene) {
  return scene.kind === 'folder'
    ? 'folder'
    : scene.kind === 'image'
      ? 'image'
      : scene.kind === 'map'
        ? 'map'
        : scene.kind === 'blankGrid'
          ? 'grid'
          : 'card';
}
