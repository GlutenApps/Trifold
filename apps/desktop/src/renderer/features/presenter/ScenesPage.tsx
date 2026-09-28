import { useEffect, useRef, useState } from 'react';
import { mediaUrl, type PresenterOverlays } from '@trifold/api';
import type { Scene } from '@trifold/schema';
import { registerHotkey } from '../../hotkeys';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';
import {
  firstChildOf,
  flattenTree,
  matchesQuery,
  nextOrder,
  parentOf,
  reorder,
  siblingAt,
} from './sceneTree';

const OVERLAY_LABELS: { [K in keyof PresenterOverlays]: string } = {
  sceneTitle: 'Scene title',
  initiativeStrip: 'Initiative strip',
  pcHealthBars: 'PC health bars',
  roundCounter: 'Round counter',
};

function blankScene(
  kind: Scene['kind'],
  title: string,
  parentId: string | null,
  order: number,
): Scene {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: '',
    kind,
    title,
    subtitle: '',
    showTitleOverride: null,
    parentId,
    order,
    notes: '',
    tokens: [],
    entryMarkers: [],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

function SceneEditor({
  scene,
  folders,
  onChange,
  onRemove,
}: {
  scene: Scene;
  folders: Scene[];
  onChange(s: Scene): void;
  onRemove(): void;
}) {
  return (
    <div className="card">
      <h2>Edit scene</h2>
      <div className="grid-fields">
        <label className="field">
          Title
          <input
            type="text"
            value={scene.title}
            onChange={(e) => onChange({ ...scene, title: e.target.value })}
          />
        </label>
        {scene.kind !== 'folder' && (
          <label className="field">
            Subtitle
            <input
              type="text"
              value={scene.subtitle}
              onChange={(e) => onChange({ ...scene, subtitle: e.target.value })}
            />
          </label>
        )}
        <label className="field">
          Folder
          <select
            value={scene.parentId ?? ''}
            onChange={(e) => onChange({ ...scene, parentId: e.target.value || null })}
          >
            <option value="">(top level)</option>
            {folders
              .filter((f) => f.id !== scene.id)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
          </select>
        </label>
        {scene.kind !== 'folder' && (
          <label className="field">
            Show title on TV
            <select
              value={
                scene.showTitleOverride === null
                  ? 'inherit'
                  : scene.showTitleOverride
                    ? 'show'
                    : 'hide'
              }
              onChange={(e) =>
                onChange({
                  ...scene,
                  showTitleOverride:
                    e.target.value === 'inherit' ? null : e.target.value === 'show',
                })
              }
            >
              <option value="inherit">Follow overlay setting</option>
              <option value="show">Always</option>
              <option value="hide">Never</option>
            </select>
          </label>
        )}
        {scene.kind === 'title' && (
          <label className="field">
            Backdrop
            <select
              value={scene.backdrop ?? 'dark'}
              onChange={(e) =>
                onChange({ ...scene, backdrop: e.target.value as Scene['backdrop'] })
              }
            >
              <option value="dark">Dark</option>
              <option value="parchment">Parchment</option>
              <option value="stone">Stone</option>
            </select>
          </label>
        )}
      </div>
      <label className="field">
        DM notes
        <textarea
          rows={3}
          value={scene.notes}
          onChange={(e) => onChange({ ...scene, notes: e.target.value })}
        />
      </label>
      <div className="row">
        <button type="button" className="btn" onClick={onRemove}>
          Remove scene
        </button>
      </div>
    </div>
  );
}

/** Scene tree and live controls for the player window (DESIGN.md §6.5). */
export function ScenesPage() {
  const current = useCampaignStore((s) => s.current);
  const load = useCampaignStore((s) => s.load);
  const saveScene = useCampaignStore((s) => s.saveScene);
  const saveScenes = useCampaignStore((s) => s.saveScenes);
  const removeScene = useCampaignStore((s) => s.removeScene);
  const importSceneImage = useCampaignStore((s) => s.importSceneImage);
  const presenter = usePresenterStore();
  const playerOpen = useAppStore((s) => s.playerOpen);
  const openPlayer = useAppStore((s) => s.openPlayer);
  const closePlayer = useAppStore((s) => s.closePlayer);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [handoutTitle, setHandoutTitle] = useState('');
  const [handoutBody, setHandoutBody] = useState('');
  const [breakTitle, setBreakTitle] = useState('Back in a few minutes');
  const [breakMinutes, setBreakMinutes] = useState('10');
  const [draft, setDraft] = useState<Scene | null>(null);
  const saveTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!current) void load();
  }, [current, load]);

  const scenes = current?.scenes ?? [];
  const slug = current?.campaign.slug ?? '';
  const liveId = presenter.state.scene?.id ?? null;
  const rows = query.trim()
    ? scenes.filter((s) => matchesQuery(s, query)).map((scene) => ({ scene, depth: 0 }))
    : flattenTree(scenes);
  const folders = scenes.filter((s) => s.kind === 'folder');
  const selected = scenes.find((s) => s.id === selectedId) ?? null;
  const previewScene = scenes.find((s) => s.id === (hoverId ?? selectedId)) ?? null;

  useEffect(() => {
    setDraft(selected);
  }, [selected]);

  // Autosave edits.
  useEffect(() => {
    if (!draft || !selected || draft === selected) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveScene(draft), 350);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draft, selected, saveScene]);

  const goLive = (scene: Scene) => {
    setSelectedId(scene.id);
    if (scene.kind === 'folder') return;
    presenter.showScene(scene, slug);
  };

  const parentForNew = () =>
    selected?.kind === 'folder' ? selected.id : (selected?.parentId ?? null);

  const create = async (kind: Scene['kind']) => {
    const parentId = parentForNew();
    const title =
      newTitle.trim() ||
      (kind === 'folder' ? 'New folder' : kind === 'title' ? 'New title card' : 'New scene');
    const base = blankScene(kind, title, parentId, nextOrder(scenes, parentId));
    if (kind === 'image') {
      const image = await importSceneImage();
      if (!image) return;
      base.image = image;
      if (!newTitle.trim()) base.title = 'New image scene';
    }
    const saved = await saveScene(base);
    if (saved) setSelectedId(saved.id);
    setNewTitle('');
  };

  // Scene navigation hotkeys send the neighbour of the live (or selected) scene to the TV.
  useEffect(() => {
    const anchor = () => scenes.find((s) => s.id === (liveId ?? selectedId)) ?? null;
    const go = (target: Scene | null) => target && goLive(target);
    const offs = [
      registerHotkey({
        id: 'scene.next',
        combo: 'Alt+ArrowDown',
        description: 'Next scene',
        run: () => {
          const a = anchor();
          if (a) go(siblingAt(scenes, a, 1));
        },
      }),
      registerHotkey({
        id: 'scene.previous',
        combo: 'Alt+ArrowUp',
        description: 'Previous scene',
        run: () => {
          const a = anchor();
          if (a) go(siblingAt(scenes, a, -1));
        },
      }),
      registerHotkey({
        id: 'scene.parent',
        combo: 'Alt+ArrowLeft',
        description: 'Parent scene',
        run: () => {
          const a = anchor();
          if (a) go(parentOf(scenes, a));
        },
      }),
      registerHotkey({
        id: 'scene.child',
        combo: 'Alt+ArrowRight',
        description: 'First child scene',
        run: () => {
          const a = anchor();
          if (a) go(firstChildOf(scenes, a));
        },
      }),
      registerHotkey({
        id: 'scene.search',
        combo: 'Ctrl+K',
        description: 'Find a scene',
        run: () => searchRef.current?.focus(),
      }),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, liveId, selectedId, slug]);

  if (!current) {
    return (
      <section>
        <h1>Presenter</h1>
        <p className="muted">Open a campaign first (Campaign section).</p>
      </section>
    );
  }

  const live = presenter.state;
  return (
    <section className="scenes">
      <h1>Presenter</h1>
      <div className="scenes-split">
        <div className="scene-tree-pane">
          <div className="row">
            <input
              ref={searchRef}
              type="text"
              aria-label="Find scene"
              placeholder="Find scene (Ctrl+K)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rows[0]) goLive(rows[0].scene);
              }}
            />
          </div>
          <div className="scene-tree" role="listbox" aria-label="Scenes">
            {rows.length === 0 && (
              <p className="muted">No scenes yet. Add a title card or an image.</p>
            )}
            {rows.map(({ scene, depth }) => (
              <div
                key={scene.id}
                role="option"
                aria-selected={scene.id === selectedId}
                className={`scene-row kind-${scene.kind}${scene.id === liveId ? ' live' : ''}${scene.id === selectedId ? ' selected' : ''}`}
                style={{ paddingLeft: 8 + depth * 16 }}
                data-testid="scene-row"
                onMouseEnter={() => setHoverId(scene.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <button
                  type="button"
                  className="scene-title"
                  onClick={() => goLive(scene)}
                  title={scene.kind === 'folder' ? 'Select folder' : 'Send to TV'}
                >
                  {scene.kind === 'folder' ? '▸ ' : scene.kind === 'image' ? '🖼 ' : '▣ '}
                  {scene.title}
                </button>
                {scene.id === liveId && <span className="badge roll">live</span>}
                <span className="spacer" />
                <button
                  type="button"
                  className="btn tiny"
                  title="Edit"
                  onClick={() => setSelectedId(scene.id)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="btn tiny"
                  title="Move up"
                  onClick={() => {
                    const r = reorder(scenes, scene, -1);
                    if (r) void saveScenes(r);
                  }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="btn tiny"
                  title="Move down"
                  onClick={() => {
                    const r = reorder(scenes, scene, 1);
                    if (r) void saveScenes(r);
                  }}
                >
                  ▼
                </button>
              </div>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void create('title');
            }}
          >
            <input
              type="text"
              aria-label="New scene title"
              placeholder="New scene title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button type="submit" className="btn primary">
              New title card
            </button>
            <button type="button" className="btn" onClick={() => void create('image')}>
              New image scene…
            </button>
            <button type="button" className="btn" onClick={() => void create('folder')}>
              New folder
            </button>
          </form>
          {presenter.recent.length > 0 && (
            <p className="muted small">
              Recent:{' '}
              {presenter.recent
                .map((id) => scenes.find((s) => s.id === id))
                .filter((s): s is Scene => Boolean(s))
                .map((s, i) => (
                  <span key={s.id}>
                    {i > 0 ? ' · ' : ''}
                    <button type="button" className="link" onClick={() => goLive(s)}>
                      {s.title}
                    </button>
                  </span>
                ))}
            </p>
          )}
        </div>

        <div className="scene-side-pane">
          <div className="card">
            <h2>TV</h2>
            <div className="row">
              <span>
                {live.blackout
                  ? 'Blackout'
                  : live.scene
                    ? `Live: ${live.scene.title}`
                    : 'Nothing live'}
                {live.handout ? ' · handout' : ''}
                {live.breakScreen ? ' · break' : ''}
              </span>
              <span className="spacer" />
              {playerOpen ? (
                <button type="button" className="btn" onClick={() => void closePlayer()}>
                  Close player window
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={() => void openPlayer()}>
                  Open player window
                </button>
              )}
            </div>
            <div className="row">
              <button
                type="button"
                className="btn"
                aria-pressed={live.blackout}
                onClick={presenter.toggleBlackout}
              >
                Blackout
              </button>
              <button
                type="button"
                className="btn"
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

          {previewScene && (
            <div className="card preview-card" data-testid="scene-preview">
              <h2>
                {previewScene === selected ? 'Selected' : 'Preview'}: {previewScene.title}
              </h2>
              {previewScene.kind === 'image' && previewScene.image && (
                <img
                  className="preview-image"
                  src={mediaUrl(slug, previewScene.image.displayPath)}
                  alt=""
                />
              )}
              {previewScene.kind === 'title' && (
                <div className={`preview-title backdrop-${previewScene.backdrop ?? 'dark'}`}>
                  <strong>{previewScene.title}</strong>
                  {previewScene.subtitle && <span>{previewScene.subtitle}</span>}
                </div>
              )}
              {previewScene.notes && <p className="muted">{previewScene.notes}</p>}
              {previewScene.kind !== 'folder' && (
                <button type="button" className="btn primary" onClick={() => goLive(previewScene)}>
                  Send to TV
                </button>
              )}
            </div>
          )}

          {draft && selected && (
            <SceneEditor
              scene={draft}
              folders={folders}
              onChange={setDraft}
              onRemove={() => {
                void removeScene(selected.id);
                setSelectedId(null);
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
