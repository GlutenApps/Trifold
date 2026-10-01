import { useEffect, useMemo, useState } from 'react';
import type { TrackView } from '@trifold/api';
import type { Playlist } from '@trifold/schema';
import { newPlaylist, useMusicStore } from '../../stores/musicStore';
import { formatTime } from './queue';
import { MusicTransport } from './MusicTransport';
import { ScanStatus } from './MusicFolders';
import { SUGGESTED_TAGS, displayTags, withTags, withoutTag } from './tags';
import { Icon } from '../shell/icons';

const TAG_LIST_ID = 'music-tag-suggestions';

/** Tags as removable chips plus one input; Enter or a comma adds, Backspace on empty removes. */
function TagEditor({ track }: { track: TrackView }) {
  const updateTrack = useMusicStore((s) => s.updateTrack);
  const [draft, setDraft] = useState('');
  const tags = displayTags(track);
  const add = (text: string) => {
    const parts = text.split(',');
    setDraft('');
    if (parts.some((p) => p.trim())) void updateTrack(track.id, withTags(tags, parts));
  };
  const remove = (tag: string) => void updateTrack(track.id, withoutTag(tags, tag));
  return (
    <div className="tag-editor">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
          <button
            type="button"
            className="tag-chip-x"
            onClick={() => remove(tag)}
            title={`Remove tag ${tag}`}
            aria-label={`Remove tag ${tag}`}
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        aria-label="Add tag"
        placeholder={tags.length ? '' : 'music, ambience, effect, or any tag'}
        list={TAG_LIST_ID}
        value={draft}
        onChange={(e) => {
          const value = e.target.value;
          if (value.includes(',')) add(value);
          else setDraft(value);
        }}
        onBlur={() => draft.trim() && add(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            remove(tags[tags.length - 1]!);
          }
        }}
      />
    </div>
  );
}

/** The playlists a track is in, each removable, and a picker for the ones it is not in. */
function TrackPlaylists({ track, playlists }: { track: TrackView; playlists: Playlist[] }) {
  const addToPlaylist = useMusicStore((s) => s.addToPlaylist);
  const removeFromPlaylist = useMusicStore((s) => s.removeFromPlaylist);
  const member = playlists.filter((p) => p.trackIds.includes(track.id));
  const others = playlists.filter((p) => !p.trackIds.includes(track.id));
  return (
    <div className="tag-editor">
      {member.map((p) => (
        <span key={p.id} className="tag-chip playlist-chip">
          {p.name}
          <button
            type="button"
            className="tag-chip-x"
            onClick={() => void removeFromPlaylist(p.id, track.id)}
            title={`Remove from ${p.name}`}
            aria-label={`Remove from ${p.name}`}
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      {others.length > 0 && (
        <select
          aria-label="Add to playlist"
          className="add-to-playlist"
          value=""
          onChange={(e) => e.target.value && void addToPlaylist(e.target.value, track.id)}
        >
          <option value="">{member.length ? '+ playlist' : 'Add to playlist…'}</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function TrackRow({
  track,
  playlists,
  onPlay,
}: {
  track: TrackView;
  playlists: Playlist[];
  onPlay(): void;
}) {
  return (
    <tr data-testid="track-row" className={track.available ? '' : 'unavailable'}>
      <td className="tt-play">
        <button
          type="button"
          className="chrome-btn xs"
          onClick={onPlay}
          disabled={!track.available}
          title="Play now"
          aria-label="Play now"
        >
          <Icon name="play" size={14} />
        </button>
      </td>
      <td className="tt-title">
        <strong>{track.title}</strong>
        {track.artist && <span className="muted small"> · {track.artist}</span>}
        {!track.available && <span className="badge warn"> missing</span>}
      </td>
      <td className="tt-len muted small">{formatTime(track.durationSec)}</td>
      <td className="tt-tags">
        <TagEditor track={track} />
      </td>
      <td className="tt-lists">
        {playlists.length > 0 && <TrackPlaylists track={track} playlists={playlists} />}
      </td>
      <td className="tt-gain muted small">
        {track.gainDb === null
          ? '…'
          : `${track.gainDb > 0 ? '+' : ''}${track.gainDb.toFixed(1)} dB`}
      </td>
    </tr>
  );
}

/** One playlist: a header that expands to its settings and tracks. */
function PlaylistItem({
  playlist,
  open,
  onToggle,
}: {
  playlist: Playlist;
  open: boolean;
  onToggle(): void;
}) {
  const library = useMusicStore((s) => s.library);
  const savePlaylist = useMusicStore((s) => s.savePlaylist);
  const removePlaylist = useMusicStore((s) => s.removePlaylist);
  const playPlaylist = useMusicStore((s) => s.playPlaylist);
  const playTrack = useMusicStore((s) => s.playTrack);
  const live = useMusicStore((s) => s.playlistId === playlist.id && s.playing);
  const defaultFade = useMusicStore((s) => s.settings.crossfadeSec);
  const tracks = playlist.trackIds
    .map((id) => library?.tracks.find((t) => t.id === id))
    .filter((t): t is TrackView => Boolean(t));
  const totalSec = tracks.reduce((sum, t) => sum + t.durationSec, 0);

  const patch = (p: Partial<Playlist>) => void savePlaylist({ ...playlist, ...p });
  const move = (i: number, step: -1 | 1) => {
    const ids = [...playlist.trackIds];
    const j = i + step;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    patch({ trackIds: ids });
  };

  return (
    <li className={`playlist-item${open ? ' open' : ''}`} data-testid="playlist-item">
      <div className="playlist-head">
        <button type="button" className="playlist-toggle" aria-expanded={open} onClick={onToggle}>
          <Icon name={open ? 'down' : 'right'} size={14} />
          <strong>{playlist.name}</strong>
          <span className="muted small">
            {tracks.length} track{tracks.length === 1 ? '' : 's'} · {formatTime(totalSec)}
          </span>
          {live && <span className="badge">playing</span>}
        </button>
        <button
          type="button"
          className="chrome-btn"
          onClick={() => void playPlaylist(playlist.id)}
          disabled={tracks.length === 0}
          title={`Play ${playlist.name}`}
          aria-label={`Play ${playlist.name}`}
        >
          <Icon name="play" />
        </button>
      </div>
      {open && (
        <div className="playlist-detail" data-testid="playlist-detail">
          <div className="row playlist-name-row">
            <input
              type="text"
              className="playlist-name"
              aria-label="Playlist name"
              value={playlist.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <button
              type="button"
              className="chrome-btn danger"
              onClick={() => void removePlaylist(playlist.id)}
              title="Delete playlist"
              aria-label={`Delete playlist ${playlist.name}`}
            >
              <Icon name="trash" />
            </button>
          </div>
          <div className="row">
            <label className="field inline">
              <input
                type="checkbox"
                checked={playlist.shuffle}
                onChange={(e) => patch({ shuffle: e.target.checked })}
              />
              Shuffle
            </label>
            <label className="field inline">
              <input
                type="checkbox"
                checked={playlist.loop}
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
                placeholder={String(defaultFade)}
                value={playlist.crossfadeSec ?? ''}
                onChange={(e) =>
                  patch({
                    crossfadeSec: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
              s
            </label>
          </div>
          {tracks.length === 0 ? (
            <p className="muted">Empty. Use "Add to playlist…" on the Tracks tab.</p>
          ) : (
            <ol className="playlist-tracks">
              {tracks.map((t, i) => (
                <li key={`${t.id}-${i}`}>
                  <button
                    type="button"
                    className="link"
                    onClick={() => void playTrack(t.id, playlist.id)}
                  >
                    {t.title}
                  </button>
                  {t.artist && <span className="muted small"> · {t.artist}</span>}
                  <span className="spacer" />
                  <span className="muted small">{formatTime(t.durationSec)}</span>
                  <span className="row-actions">
                    <button
                      type="button"
                      className="chrome-btn xs"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      title="Move up"
                      aria-label="Move up"
                    >
                      <Icon name="up" size={14} />
                    </button>
                    <button
                      type="button"
                      className="chrome-btn xs"
                      onClick={() => move(i, 1)}
                      disabled={i === tracks.length - 1}
                      title="Move down"
                      aria-label="Move down"
                    >
                      <Icon name="down" size={14} />
                    </button>
                    <button
                      type="button"
                      className="chrome-btn xs"
                      onClick={() =>
                        patch({ trackIds: playlist.trackIds.filter((_, j) => j !== i) })
                      }
                      title="Remove from playlist"
                      aria-label="Remove from playlist"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

/** Playlists tab: create one, then expand any number to edit them side by side. */
function PlaylistsTab({
  open,
  setOpen,
}: {
  /** Expanded playlists; owned by the Music panel so switching tabs keeps them open. */
  open: ReadonlySet<string>;
  setOpen(update: (prev: ReadonlySet<string>) => ReadonlySet<string>): void;
}) {
  const playlists = useMusicStore((s) => s.playlists);
  const savePlaylist = useMusicStore((s) => s.savePlaylist);
  const [name, setName] = useState('');
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="card wide-card">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void savePlaylist(newPlaylist(name.trim())).then(
            (saved) => saved && setOpen((prev) => new Set(prev).add(saved.id)),
          );
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
      {playlists.length === 0 ? (
        <p className="muted">No playlists yet.</p>
      ) : (
        <ul className="playlist-list">
          {playlists.map((p) => (
            <PlaylistItem
              key={p.id}
              playlist={p}
              open={open.has(p.id)}
              onToggle={() => toggle(p.id)}
            />
          ))}
        </ul>
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
  const rescan = useMusicStore((s) => s.rescan);
  const scanning = useMusicStore((s) => s.scan !== null && s.scan.phase !== 'done');
  const error = useMusicStore((s) => s.error);
  const clearError = useMusicStore((s) => s.clearError);
  const [query, setQuery] = useState('');
  /** 'all', 'unsorted' (in no playlist), or a tag. */
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState<'tracks' | 'playlists'>('tracks');
  const [openPlaylists, setOpenPlaylists] = useState<ReadonlySet<string>>(new Set());

  // Always refresh on open: folders can change while the page is away (scans, other sections).
  useEffect(() => {
    void load();
  }, [load]);

  const tagsInUse = useMemo(() => {
    const all = new Set<string>();
    for (const t of library?.tracks ?? []) for (const tag of displayTags(t)) all.add(tag);
    return [...all].sort();
  }, [library]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = new Set(playlists.flatMap((p) => p.trackIds));
    return (library?.tracks ?? [])
      .filter((t) =>
        filter === 'all'
          ? true
          : filter === 'unsorted'
            ? !sorted.has(t.id)
            : displayTags(t).includes(filter),
      )
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          (t.artist ?? '').toLowerCase().includes(q) ||
          displayTags(t).some((tag) => tag.includes(q)),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [library, playlists, query, filter]);

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
      <div className="music-tabbar">
        <div className="music-tablist" role="tablist" aria-label="Music view">
          {(
            [
              ['tracks', `Tracks (${library?.tracks.length ?? 0})`],
              ['playlists', `Playlists (${playlists.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`music-tab${tab === id ? ' active' : ''}`}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {tab === 'tracks' && (
          <>
            <ScanStatus />
            <button
              type="button"
              className="chrome-btn"
              onClick={() => void rescan()}
              disabled={!library?.folders.length || scanning}
              title="Rescan music folders: picks up new, renamed and deleted files"
              aria-label="Rescan music folders"
            >
              <Icon name="refresh" />
            </button>
          </>
        )}
      </div>
      {tab === 'playlists' ? (
        <div role="tabpanel" aria-label="Playlists" className="music-tabpanel">
          <PlaylistsTab open={openPlaylists} setOpen={setOpenPlaylists} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Tracks" className="music-tabpanel card wide-card">
          <div className="row">
            <input
              type="text"
              aria-label="Find track"
              placeholder="Find by title, artist or tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Show tracks"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All tracks</option>
              <option value="unsorted">Not in a playlist</option>
              {tagsInUse.map((tag) => (
                <option key={tag} value={tag}>
                  Tagged {tag}
                </option>
              ))}
            </select>
            <span className="muted small">
              {rows.length} of {library?.tracks.length ?? 0}
            </span>
          </div>
          <datalist id={TAG_LIST_ID}>
            {[...new Set([...tagsInUse, ...SUGGESTED_TAGS])].map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          {rows.length === 0 ? (
            <p className="muted">
              {library?.tracks.length
                ? 'No tracks match.'
                : 'No tracks. Add a folder of MP3, OGG, FLAC, WAV or M4A files.'}
            </p>
          ) : (
            <div className="track-table-wrap">
              <table className="track-table">
                <thead>
                  <tr>
                    <th />
                    <th>Title</th>
                    <th>Length</th>
                    <th>Tags</th>
                    <th>Playlists</th>
                    <th>Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      playlists={playlists}
                      onPlay={() => void playTrack(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
