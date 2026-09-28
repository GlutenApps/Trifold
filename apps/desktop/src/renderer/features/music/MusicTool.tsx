import { useEffect, useMemo, useState } from 'react';
import type { TrackView } from '@trifold/api';
import type { Playlist, TrackKind } from '@trifold/schema';
import { newPlaylist, useMusicStore } from '../../stores/musicStore';
import { formatTime } from './queue';
import { MusicTransport } from './MusicTransport';

const KINDS: Array<{ value: TrackKind; label: string }> = [
  { value: 'music', label: 'Music' },
  { value: 'ambience', label: 'Ambience' },
  { value: 'sfx', label: 'Effect' },
];

function TrackRow({
  track,
  playlists,
  onPlay,
  onAdd,
}: {
  track: TrackView;
  playlists: Playlist[];
  onPlay(): void;
  onAdd(playlistId: string): void;
}) {
  const updateTrack = useMusicStore((s) => s.updateTrack);
  const [tags, setTags] = useState(track.tags.join(', '));
  useEffect(() => setTags(track.tags.join(', ')), [track.tags]);
  const commitTags = () => {
    const next = tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (next.join(',') !== track.tags.join(',')) void updateTrack(track.id, { tags: next });
  };
  return (
    <tr data-testid="track-row" className={track.available ? '' : 'unavailable'}>
      <td>
        <button
          type="button"
          className="btn tiny"
          onClick={onPlay}
          disabled={!track.available}
          title="Play now"
          aria-label="Play now"
        >
          ▶
        </button>
      </td>
      <td>
        <strong>{track.title}</strong>
        {track.artist && <span className="muted small"> · {track.artist}</span>}
        {!track.available && <span className="badge warn"> missing</span>}
      </td>
      <td className="muted small">{formatTime(track.durationSec)}</td>
      <td>
        <select
          aria-label="Track kind"
          value={track.kind}
          onChange={(e) => void updateTrack(track.id, { kind: e.target.value as TrackKind })}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="text"
          aria-label="Tags"
          placeholder="tags, comma separated"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={commitTags}
          onKeyDown={(e) => e.key === 'Enter' && commitTags()}
        />
      </td>
      <td className="muted small">
        {track.gainDb === null
          ? '…'
          : `${track.gainDb > 0 ? '+' : ''}${track.gainDb.toFixed(1)} dB`}
      </td>
      <td>
        {playlists.length > 0 && (
          <select
            aria-label="Add to playlist"
            value=""
            onChange={(e) => e.target.value && onAdd(e.target.value)}
          >
            <option value="">Add to…</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </td>
    </tr>
  );
}

function Playlists({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect(id: string | null): void;
}) {
  const playlists = useMusicStore((s) => s.playlists);
  const library = useMusicStore((s) => s.library);
  const savePlaylist = useMusicStore((s) => s.savePlaylist);
  const removePlaylist = useMusicStore((s) => s.removePlaylist);
  const playPlaylist = useMusicStore((s) => s.playPlaylist);
  const playTrack = useMusicStore((s) => s.playTrack);
  const playingId = useMusicStore((s) => s.playlistId);
  const [name, setName] = useState('');
  const selected = playlists.find((p) => p.id === selectedId) ?? null;
  const tracks = selected
    ? selected.trackIds
        .map((id) => library?.tracks.find((t) => t.id === id))
        .filter((t): t is TrackView => Boolean(t))
    : [];

  const patch = (p: Partial<Playlist>) => selected && void savePlaylist({ ...selected, ...p });
  const move = (i: number, step: -1 | 1) => {
    if (!selected) return;
    const ids = [...selected.trackIds];
    const j = i + step;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    patch({ trackIds: ids });
  };

  return (
    <div className="card">
      <h2>Playlists</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void savePlaylist(newPlaylist(name.trim())).then((saved) => saved && onSelect(saved.id));
          setName('');
        }}
      >
        <input
          type="text"
          aria-label="New playlist name"
          placeholder="New playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn">
          Create playlist
        </button>
      </form>
      {playlists.length > 0 && (
        <div className="row wrap">
          {playlists.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn tiny${p.id === playingId ? ' primary' : ''}`}
              aria-pressed={p.id === selectedId}
              onClick={() => onSelect(p.id === selectedId ? null : p.id)}
            >
              {p.name} ({p.trackIds.length})
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="playlist-detail" data-testid="playlist-detail">
          <div className="row">
            <input
              type="text"
              aria-label="Playlist name"
              value={selected.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <label className="field inline">
              <input
                type="checkbox"
                checked={selected.shuffle}
                onChange={(e) => patch({ shuffle: e.target.checked })}
              />
              Shuffle
            </label>
            <label className="field inline">
              <input
                type="checkbox"
                checked={selected.loop}
                onChange={(e) => patch({ loop: e.target.checked })}
              />
              Loop
            </label>
            <label className="field inline">
              Crossfade
              <input
                type="number"
                className="narrow"
                min={0}
                max={30}
                step={0.5}
                placeholder="default"
                value={selected.crossfadeSec ?? ''}
                onChange={(e) =>
                  patch({
                    crossfadeSec: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </label>
            <span className="spacer" />
            <button
              type="button"
              className="btn primary"
              onClick={() => void playPlaylist(selected.id)}
              disabled={selected.trackIds.length === 0}
            >
              Play playlist
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void removePlaylist(selected.id).then(() => onSelect(null))}
            >
              Delete
            </button>
          </div>
          {tracks.length === 0 ? (
            <p className="muted">Empty. Use "Add to…" on a track.</p>
          ) : (
            <ol className="playlist-tracks">
              {tracks.map((t, i) => (
                <li key={`${t.id}-${i}`}>
                  <button
                    type="button"
                    className="link"
                    onClick={() => void playTrack(t.id, selected.id)}
                  >
                    {t.title}
                  </button>
                  <span className="muted small"> {formatTime(t.durationSec)}</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => move(i, -1)}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => move(i, 1)}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => patch({ trackIds: selected.trackIds.filter((_, j) => j !== i) })}
                    title="Remove from playlist"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Music section (DESIGN.md §6.6): folders, tags, playlists, the music layer player. */
export function MusicTool() {
  const library = useMusicStore((s) => s.library);
  const playlists = useMusicStore((s) => s.playlists);
  const load = useMusicStore((s) => s.load);
  const playTrack = useMusicStore((s) => s.playTrack);
  const savePlaylist = useMusicStore((s) => s.savePlaylist);
  const error = useMusicStore((s) => s.error);
  const clearError = useMusicStore((s) => s.clearError);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<TrackKind | 'all'>('all');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);

  // Always refresh on open: folders can change while the page is away (scans, other sections).
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (library?.tracks ?? [])
      .filter((t) => kind === 'all' || t.kind === kind)
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          (t.artist ?? '').toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q)),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [library, query, kind]);

  const addToPlaylist = (playlistId: string, trackId: string) => {
    const playlist = playlists.find((p) => p.id === playlistId);
    if (playlist) void savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, trackId] });
  };

  return (
    <div className="music">
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      <MusicTransport />
      <div className="music-stack">
        <Playlists selectedId={selectedPlaylist} onSelect={setSelectedPlaylist} />
        <div className="card wide-card">
          <h2>Tracks</h2>
          <div className="row">
            <input
              type="text"
              aria-label="Find track"
              placeholder="Find by title, artist or tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Kind filter"
              value={kind}
              onChange={(e) => setKind(e.target.value as TrackKind | 'all')}
            >
              <option value="all">All kinds</option>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <span className="muted small">
              {rows.length} of {library?.tracks.length ?? 0}
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="muted">No tracks. Add a folder of MP3, OGG, FLAC, WAV or M4A files.</p>
          ) : (
            <table className="track-table">
              <thead>
                <tr>
                  <th />
                  <th>Title</th>
                  <th>Length</th>
                  <th>Kind</th>
                  <th>Tags</th>
                  <th>Gain</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    playlists={playlists}
                    onPlay={() => void playTrack(t.id)}
                    onAdd={(pid) => addToPlaylist(pid, t.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
