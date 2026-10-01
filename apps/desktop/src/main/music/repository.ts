import { readdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { parseFile } from 'music-metadata';
import { ulid } from 'ulid';
import type { MusicLibraryView, MusicScanProgress, TrackView } from '@trifold/api';
import { MusicLibrary, Playlist, Track, emptyMusicLibrary } from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.flac', '.wav', '.m4a']);
const LIBRARY_FILE = 'music/library.json';
const PLAYLISTS_DIR = 'music/playlists';

function nowIso(): string {
  return new Date().toISOString();
}

/** Music files referenced in place (DESIGN.md §6.6, DATA-FORMATS.md §5.5). Never moves or copies. */
export class MusicRepository {
  private library: MusicLibrary | null = null;
  private scanning: Promise<MusicLibraryView> | null = null;

  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
  ) {}

  private async load(): Promise<MusicLibrary> {
    if (this.library) return this.library;
    try {
      this.library = await this.store.readJson(LIBRARY_FILE, MusicLibrary, 'musicLibrary');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`music/library.json unreadable, starting fresh: ${String(err)}`);
      }
      this.library = emptyMusicLibrary();
    }
    return this.library;
  }

  private async save(): Promise<void> {
    if (this.library) await this.store.writeJson(LIBRARY_FILE, this.library);
  }

  async view(): Promise<MusicLibraryView> {
    const lib = await this.load();
    const tracks: TrackView[] = await Promise.all(
      lib.tracks.map(async (t) => ({ ...t, available: await exists(t.path) })),
    );
    return { folders: [...lib.folders], tracks, lastScanAt: lib.lastScanAt };
  }

  /** Absolute file path for the media handler, or null for unknown ids. */
  trackPath(trackId: string): string | null {
    return this.library?.tracks.find((t) => t.id === trackId)?.path ?? null;
  }

  async addFolder(
    path: string,
    onProgress?: (p: MusicScanProgress) => void,
  ): Promise<MusicLibraryView> {
    const lib = await this.load();
    if (!lib.folders.includes(path)) lib.folders.push(path);
    return this.scan(onProgress);
  }

  /** Same as `scan()`; named so tests read clearly. */
  rescanForTest(): Promise<MusicLibraryView> {
    return this.scan();
  }

  async removeFolder(path: string): Promise<MusicLibraryView> {
    const lib = await this.load();
    lib.folders = lib.folders.filter((f) => f !== path);
    const prefix = path.replace(/[\\/]+$/, '').toLowerCase();
    lib.tracks = lib.tracks.filter((t) => !t.path.toLowerCase().startsWith(prefix));
    await this.save();
    return this.view();
  }

  /** Walks every folder; new files get tags read, known files keep their tags, gain and trims. */
  async scan(onProgress?: (p: MusicScanProgress) => void): Promise<MusicLibraryView> {
    if (this.scanning) return this.scanning;
    this.scanning = this.scanNow(onProgress).finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  /**
   * Relinks renamed or moved files to their tracks (same size and length), drops tracks whose
   * files are gone from a readable folder (and from playlists), and adds new files. Tracks in a
   * folder that cannot be read at all (an unplugged drive) stay listed as unavailable.
   */
  private async scanNow(onProgress?: (p: MusicScanProgress) => void): Promise<MusicLibraryView> {
    const lib = await this.load();
    const files: string[] = [];
    const reachable: string[] = [];
    for (const folder of lib.folders) {
      if (await walk(folder, files, this.logger)) reachable.push(folder);
      onProgress?.({ phase: 'listing', read: 0, found: files.length, added: 0 });
    }
    const onDisk = new Set(files.map((f) => f.toLowerCase()));
    const known = new Set(lib.tracks.map((t) => t.path.toLowerCase()));

    // Backfill sizes so a later rename can be recognised.
    for (const track of lib.tracks) {
      if (track.sizeBytes === undefined && onDisk.has(track.path.toLowerCase())) {
        const size = await sizeOf(track.path);
        if (size !== null) track.sizeBytes = size;
      }
    }

    let read = 0;
    const fresh: Track[] = [];
    for (const file of files) {
      read += 1;
      if (known.has(file.toLowerCase())) continue;
      onProgress?.({
        phase: 'reading',
        read,
        found: files.length,
        added: fresh.length,
        current: basename(file),
      });
      fresh.push(await this.readTrack(file));
    }

    const gone = lib.tracks.filter(
      (t) => !onDisk.has(t.path.toLowerCase()) && insideAny(t.path, reachable),
    );
    const links = matchRenames(gone, fresh);
    const linked = new Set(links.values());
    const goneIds = new Set(gone.map((t) => t.id));
    lib.tracks = lib.tracks.flatMap((t) => {
      if (!goneIds.has(t.id)) return [t];
      const moved = links.get(t);
      return moved ? [relink(t, moved)] : [];
    });
    const added = fresh.filter((t) => !linked.has(t));
    lib.tracks.push(...added);
    const removed = gone.length - links.size;
    if (removed > 0) await this.prunePlaylists(new Set(lib.tracks.map((t) => t.id)));

    lib.lastScanAt = nowIso();
    await this.save();
    onProgress?.({
      phase: 'done',
      read,
      found: files.length,
      added: added.length,
      renamed: links.size,
      removed,
    });
    this.logger.info(
      `music scan: ${files.length} files, ${added.length} new, ${links.size} renamed, ${removed} removed`,
    );
    return this.view();
  }

  /** Drops ids of tracks that no longer exist from every playlist that holds them. */
  private async prunePlaylists(live: Set<string>): Promise<void> {
    for (const playlist of await this.listPlaylists()) {
      const trackIds = playlist.trackIds.filter((id) => live.has(id));
      if (trackIds.length !== playlist.trackIds.length) {
        await this.savePlaylist({ ...playlist, trackIds });
      }
    }
  }

  private async readTrack(file: string): Promise<Track> {
    const fallbackTitle = basename(file, extname(file));
    const size = await sizeOf(file);
    const sized = size !== null ? { sizeBytes: size } : {};
    try {
      const meta = await parseFile(file, { duration: true, skipCovers: true });
      return Track.parse({
        id: ulid(),
        path: file,
        ...sized,
        title: meta.common.title?.trim() || fallbackTitle,
        ...(meta.common.artist ? { artist: meta.common.artist } : {}),
        ...(meta.common.album ? { album: meta.common.album } : {}),
        durationSec: meta.format.duration ?? 0,
        addedAt: nowIso(),
      });
    } catch (err) {
      this.logger.warn(`could not read tags from ${file}: ${String(err)}`);
      return Track.parse({
        id: ulid(),
        path: file,
        ...sized,
        title: fallbackTitle,
        addedAt: nowIso(),
      });
    }
  }

  async updateTrack(trackId: string, patch: Partial<Track>): Promise<TrackView | null> {
    const lib = await this.load();
    const i = lib.tracks.findIndex((t) => t.id === trackId);
    if (i === -1) return null;
    const current = lib.tracks[i]!;
    // Identity and location are not editable through this call.
    const { id: _id, path: _path, addedAt: _addedAt, ...rest } = patch;
    void _id;
    void _path;
    void _addedAt;
    const next = Track.parse({ ...current, ...rest });
    lib.tracks[i] = next;
    await this.save();
    return { ...next, available: await exists(next.path) };
  }

  async listPlaylists(): Promise<Playlist[]> {
    const dir = this.store.resolvePath(PLAYLISTS_DIR);
    let names: string[] = [];
    try {
      names = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const out: Playlist[] = [];
    for (const name of names) {
      try {
        out.push(await this.store.readJson(`${PLAYLISTS_DIR}/${name}`, Playlist, 'playlist'));
      } catch (err) {
        this.logger.warn(`skipping playlist ${name}: ${String(err)}`);
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async savePlaylist(playlist: Playlist): Promise<Playlist> {
    const saved = Playlist.parse({
      ...playlist,
      id: playlist.id || ulid(),
      updatedAt: nowIso(),
    });
    await this.store.writeJson(`${PLAYLISTS_DIR}/${saved.id}.json`, saved);
    return saved;
  }

  async removePlaylist(playlistId: string): Promise<void> {
    if (!/^[A-Za-z0-9]+$/.test(playlistId)) return;
    try {
      await unlink(this.store.resolvePath(`${PLAYLISTS_DIR}/${playlistId}.json`));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

function insideAny(path: string, folders: readonly string[]): boolean {
  const p = path.toLowerCase();
  return folders.some((f) => {
    const prefix = f.replace(/[\\/]+$/, '').toLowerCase();
    return p.startsWith(`${prefix}\\`) || p.startsWith(`${prefix}/`);
  });
}

/**
 * Pairs each vanished track with the one new file that is the same audio: equal size and
 * length, or, for tracks scanned before sizes were stored, equal length in the same folder.
 * Anything ambiguous stays unpaired.
 */
export function matchRenames(gone: readonly Track[], fresh: readonly Track[]): Map<Track, Track> {
  const same = (old: Track, next: Track) => {
    if (Math.abs(old.durationSec - next.durationSec) > 0.1) return false;
    if (old.sizeBytes !== undefined) return old.sizeBytes === next.sizeBytes;
    return (
      old.durationSec > 0 && dirname(old.path).toLowerCase() === dirname(next.path).toLowerCase()
    );
  };
  const links = new Map<Track, Track>();
  for (const old of gone) {
    const candidates = fresh.filter((next) => same(old, next));
    if (candidates.length !== 1) continue;
    const next = candidates[0]!;
    if (gone.filter((g) => same(g, next)).length === 1) links.set(old, next);
  }
  return links;
}

/** The old track at its new path: keeps id, tags, gain and trims; a filename title follows the file. */
function relink(old: Track, next: Track): Track {
  const titleFromFile = old.title === basename(old.path, extname(old.path));
  return {
    ...old,
    path: next.path,
    ...(next.sizeBytes !== undefined ? { sizeBytes: next.sizeBytes } : {}),
    durationSec: next.durationSec || old.durationSec,
    title: titleFromFile ? next.title : old.title,
  };
}

/** Collects audio files under `dir`; false when `dir` itself cannot be read. */
async function walk(dir: string, out: string[], logger: Logger): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.warn(`music folder unreadable: ${dir} (${String(err)})`);
    return false;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out, logger);
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      out.push(full);
  }
  return true;
}
