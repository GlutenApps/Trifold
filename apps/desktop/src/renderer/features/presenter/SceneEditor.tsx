import { useState } from 'react';
import type { Playlist, Scene } from '@trifold/schema';
import { InlineConfirm } from '../shell/InlineConfirm';
import { Icon } from '../shell/icons';

/**
 * The scene metadata form inside the Scenes tool (ADR 0008): the fields every scene kind
 * shares. It edits the scene the tool hands it and reports each change up; the tool owns the
 * draft, the autosave and the TV mirror. Map-only settings (grid, tokens, camera) live in the
 * map editor, not here.
 */

/** The edit-scene form (title, subtitle, TV title rule, music on go-live, backdrop, notes). Folders are set by dragging in the tree. */
export function SceneEditor({
  scene,
  playlists,
  onChange,
  onRemove,
}: {
  scene: Scene;
  playlists: Playlist[];
  onChange(s: Scene): void;
  onRemove(): void;
}) {
  const [confirming, setConfirming] = useState(false);
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
        {scene.kind !== 'folder' && (
          <label className="field">
            Music on go-live
            <select
              value={scene.audio?.playlistId ?? ''}
              onChange={(e) =>
                onChange({
                  ...scene,
                  audio: {
                    ambienceIds: scene.audio?.ambienceIds ?? [],
                    ...(e.target.value ? { playlistId: e.target.value } : {}),
                  },
                })
              }
            >
              <option value="">Keep current audio</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
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
        {confirming ? (
          <InlineConfirm
            name={scene.title || 'this scene'}
            onConfirm={() => {
              setConfirming(false);
              onRemove();
            }}
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
            <Icon name="trash" />
            Delete scene
          </button>
        )}
      </div>
    </div>
  );
}
