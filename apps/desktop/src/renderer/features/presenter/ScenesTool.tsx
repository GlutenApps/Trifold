import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl } from '@trifold/api';
import type { Scene } from '@trifold/schema';
import { registerHotkey } from '../../hotkeys';
import { landOn, navKey, useNavTarget } from '../../navigate';
import { useCampaignStore } from '../../stores/campaignStore';
import { useMusicStore } from '../../stores/musicStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useSceneStore } from '../../stores/sceneStore';
import { Icon } from '../shell/icons';
import { placeItem } from '@trifold/rules';
import { useTreeDnd } from '../../treeDnd';
import { createScene } from './createScene';
import { SceneEditor } from './SceneEditor';
import { firstChildOf, flattenTree, matchesQuery, parentOf, siblingAt } from './sceneTree';

/**
 * The Scenes dock tool (ADR 0004, amended by ADR 0008): the list. It is the only place scenes
 * are added, edited, reordered or removed; the TV tab shows the selection. `ScenesTool` below
 * has the detail.
 */

const isFolder = (scene: Scene) => scene.kind === 'folder';

/**
 * The Scenes tool (ADR 0004, Scenes minor): tree, new-scene row and the edit form.
 * Click selects and previews; Enter, double-click or ▶ sends to the TV (ADR 0004: click
 * selects, Enter sends).
 */
export function ScenesTool() {
  const current = useCampaignStore((s) => s.current);
  const saveScenes = useCampaignStore((s) => s.saveScenes);
  const removeScene = useCampaignStore((s) => s.removeScene);
  const liveId = usePresenterStore((s) => s.state.scene?.id ?? null);
  const blackout = usePresenterStore((s) => s.state.blackout);
  const recent = usePresenterStore((s) => s.recent);
  const playlists = useMusicStore((s) => s.playlists);
  const selectedId = useSceneStore((s) => s.selectedId);
  const hoverId = useSceneStore((s) => s.hoverId);
  const draft = useSceneStore((s) => s.draft);
  const select = useSceneStore((s) => s.select);
  const setHover = useSceneStore((s) => s.setHover);
  const setDraft = useSceneStore((s) => s.setDraft);
  const send = useSceneStore((s) => s.send);
  const [query, setQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [preview, setPreview] = useState<{ top: number; left: number } | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const scenes = useMemo(() => current?.scenes ?? [], [current]);
  const slug = current?.campaign.slug ?? '';
  const rows = query.trim()
    ? scenes.filter((s) => matchesQuery(s, query)).map((scene) => ({ scene, depth: 0 }))
    : flattenTree(scenes);
  const folders = scenes.filter(isFolder);
  const selected = scenes.find((s) => s.id === selectedId) ?? null;
  const hovered = scenes.find((s) => s.id === hoverId) ?? null;

  // Rows drag to reorder, into a folder, or to the empty space below for the root.
  const dnd = useTreeDnd<Scene>({
    items: scenes,
    isFolder,
    onMove: (id, parentId, index) => {
      const changed = placeItem(scenes, id, parentId, index);
      if (changed.length) void saveScenes(changed);
    },
  });

  // Scene navigation hotkeys send the neighbour of the live (or selected) scene to the TV.
  useEffect(() => {
    const anchor = () => scenes.find((s) => s.id === (liveId ?? selectedId)) ?? null;
    const go = (target: Scene | null) => target && send(target);
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
    ];
    return () => offs.forEach((off) => off());
  }, [scenes, liveId, selectedId, send]);

  // Deep links (ADR 0017): select the scene and show its row; a map also opens the VTT.
  useNavTarget('scene', (target) => {
    setQuery('');
    select(target.id);
    landOn(navKey('scene', target.id));
    return true;
  });

  if (!current) return <p className="muted">Open a campaign first.</p>;

  const kindIcon = (scene: Scene) =>
    scene.kind === 'folder'
      ? 'folder'
      : scene.kind === 'image'
        ? 'image'
        : scene.kind === 'map'
          ? 'map'
          : scene.kind === 'blankGrid'
            ? 'grid'
            : 'card';

  const hoverRow = (scene: Scene, el: HTMLElement | null) => {
    setHover(scene.id);
    if (!el || scene.kind === 'folder') {
      setPreview(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setPreview({ top: Math.min(r.top, window.innerHeight - 220), left: r.left - 292 });
  };

  return (
    <div className="scenes-tool">
      <input
        type="text"
        aria-label="Find scene"
        placeholder="Find scene"
        className="wide"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && rows[0]) select(rows[0].scene.id);
        }}
      />
      <form
        className="row new-scene"
        onSubmit={(e) => {
          e.preventDefault();
          void createScene('title', newTitle).then(() => setNewTitle(''));
        }}
      >
        <input
          type="text"
          aria-label="New scene title"
          placeholder="New scene title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <span className="icon-toolbar" role="group" aria-label="New scene">
          <button
            type="submit"
            className="chrome-btn primary"
            aria-label="New title card"
            title="New title card"
          >
            <Icon name="card" />
          </button>
          {(
            [
              ['image', 'New image scene…', 'image'],
              ['map', 'New map…', 'map'],
              ['blankGrid', 'New blank grid', 'grid'],
              ['folder', 'New folder', 'folder'],
            ] as const
          ).map(([kind, label, icon]) => (
            <button
              key={kind}
              type="button"
              className="chrome-btn"
              aria-label={label}
              title={label}
              onClick={() => void createScene(kind, newTitle).then(() => setNewTitle(''))}
            >
              <Icon name={icon} />
            </button>
          ))}
        </span>
      </form>

      <div
        className={`scene-tree${dnd.containerClass}`}
        role="listbox"
        aria-label="Scenes"
        ref={treeRef}
        onMouseLeave={() => {
          setHover(null);
          setPreview(null);
        }}
        {...dnd.containerProps}
      >
        {rows.length === 0 && <p className="muted">No scenes yet. Add a title card or an image.</p>}
        {rows.map(({ scene, depth }) => {
          const isLive = scene.id === liveId && !blackout;
          const isSelected = scene.id === selectedId;
          return (
            <div
              key={scene.id}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              className={`scene-row kind-${scene.kind}${isLive ? ' live' : ''}${isSelected ? ' selected' : ''}${dnd.rowClass(scene)}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              data-testid="scene-row"
              data-nav={navKey('scene', scene.id)}
              onMouseEnter={(e) => hoverRow(scene, e.currentTarget)}
              onClick={() => select(scene.id)}
              onDoubleClick={() => send(scene)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send(scene);
              }}
              {...dnd.rowProps(scene)}
            >
              <span className="scene-title">
                <Icon name={kindIcon(scene)} size={14} />
                <span className="scene-name">{scene.title}</span>
              </span>
              {isLive && <span className="badge live">live</span>}
              <span className="scene-actions">
                {scene.kind !== 'folder' && (
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-label={`Send ${scene.title} to TV`}
                    title="Send to TV (Enter)"
                    onClick={(e) => {
                      e.stopPropagation();
                      send(scene);
                    }}
                  >
                    <Icon name="play" />
                  </button>
                )}
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Edit ${scene.title}`}
                  aria-pressed={editOpen && isSelected}
                  title={editOpen && isSelected ? 'Close the editor' : 'Edit'}
                  onClick={(e) => {
                    e.stopPropagation();
                    select(scene.id);
                    setEditOpen(!(editOpen && isSelected));
                  }}
                >
                  <Icon name="pencil" />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <p className="muted small">
          Recent:{' '}
          {recent
            .map((id) => scenes.find((s) => s.id === id))
            .filter((s): s is Scene => Boolean(s))
            .map((s, i) => (
              <span key={s.id}>
                {i > 0 ? ' · ' : ''}
                <button type="button" className="link" onClick={() => send(s)}>
                  {s.title}
                </button>
              </span>
            ))}
        </p>
      )}

      {/* The row shows selection, live state, Send to TV and Edit, so only the edit form
          opens here, from the row's Edit button. */}
      {editOpen && selected && draft && (
        <div className="card selected-card" data-testid="scene-editor">
          <div className="row">
            <strong className="grow scene-name">{selected.title}</strong>
            <button
              type="button"
              className="chrome-btn xs"
              aria-label="Close scene editor"
              title="Close"
              onClick={() => setEditOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <SceneEditor
            scene={draft}
            playlists={playlists}
            onChange={setDraft}
            onRemove={() => {
              void removeScene(selected.id);
              setEditOpen(false);
              select(null);
            }}
          />
        </div>
      )}

      {hovered && preview && hovered.id !== selectedId && (
        <div className="fly preview" style={preview} data-testid="scene-preview">
          {(hovered.kind === 'image' || hovered.kind === 'map') && hovered.image && (
            <img className="preview-image" src={mediaUrl(slug, hovered.image.displayPath)} alt="" />
          )}
          {hovered.kind === 'title' && (
            <div className={`preview-title backdrop-${hovered.backdrop ?? 'dark'}`}>
              <strong>{hovered.title}</strong>
              {hovered.subtitle && <span>{hovered.subtitle}</span>}
            </div>
          )}
          {hovered.kind === 'blankGrid' && <div className="preview-title backdrop-parchment" />}
          <p className="muted small">
            {hovered.kind} · {folders.find((f) => f.id === hovered.parentId)?.title ?? 'top level'}{' '}
            · Enter sends
          </p>
        </div>
      )}
    </div>
  );
}
