import { useState } from 'react';
import type { Playlist, Scene, Track } from '@trifold/schema';
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
  tracks = [],
  onChange,
  onRemove,
}: {
  scene: Scene;
  playlists: Playlist[];
  /** The music library's tracks a scene can link on its own (sound effects are left out). */
  tracks?: Pick<Track, 'id' | 'title' | 'artist' | 'kind'>[];
  onChange(s: Scene): void;
  onRemove(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const audio = scene.audio;
  const linked = audio?.playlistId
    ? `p:${audio.playlistId}`
    : audio?.trackId
      ? `t:${audio.trackId}`
      : '';
  const linkedPlaylist = playlists.find((p) => p.id === audio?.playlistId);
  const songs = tracks
    .filter((t) => t.kind !== 'sfx')
    .sort((a, b) => a.title.localeCompare(b.title));
  const missingTrack = !!audio?.trackId && !songs.some((t) => t.id === audio.trackId);
  // A playlist follows its own saved loop until the scene says otherwise; a track plays once.
  const loops = audio?.loop ?? linkedPlaylist?.loop ?? false;
  const link = (value: string) => {
    const ambienceIds = audio?.ambienceIds ?? [];
    if (value.startsWith('p:')) {
      const id = value.slice(2);
      const loop = playlists.find((p) => p.id === id)?.loop ?? true;
      onChange({ ...scene, audio: { ambienceIds, playlistId: id, loop } });
    } else if (value.startsWith('t:')) {
      onChange({ ...scene, audio: { ambienceIds, trackId: value.slice(2), loop: true } });
    } else {
      onChange({ ...scene, audio: { ambienceIds } });
    }
  };
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
            <select value={linked} onChange={(e) => link(e.target.value)}>
              <option value="">Keep current audio</option>
              {playlists.length > 0 && (
                <optgroup label="Playlists">
                  {playlists.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {(songs.length > 0 || missingTrack) && (
                <optgroup label="Tracks">
                  {missingTrack && <option value={linked}>Missing track</option>}
                  {songs.map((t) => (
                    <option key={t.id} value={`t:${t.id}`}>
                      {t.artist ? `${t.title} · ${t.artist}` : t.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}
        {scene.kind !== 'folder' && linked && (
          <label className="field inline">
            <input
              type="checkbox"
              checked={loops}
              onChange={(e) =>
                onChange({
                  ...scene,
                  audio: { ...(audio ?? { ambienceIds: [] }), loop: e.target.checked },
                })
              }
            />
            {audio?.playlistId ? 'Loop the playlist' : 'Loop the track'}
          </label>
        )}
        {scene.kind !== 'folder' && playlists.length === 0 && songs.length === 0 && (
          <p className="muted small">
            Add a music folder in the Music tool to link music to this scene.
          </p>
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
