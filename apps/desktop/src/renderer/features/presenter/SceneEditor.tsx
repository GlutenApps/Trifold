import type { Playlist, Scene } from '@trifold/schema';

/** The edit-scene form (title, subtitle, folder, TV title rule, music on go-live, backdrop, notes). */
export function SceneEditor({
  scene,
  folders,
  playlists,
  onChange,
  onRemove,
}: {
  scene: Scene;
  folders: Scene[];
  playlists: Playlist[];
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
        <button type="button" className="btn" onClick={onRemove}>
          Remove scene
        </button>
      </div>
    </div>
  );
}

/** Scene tree and live controls for the player window (DESIGN.md §6.5). */
