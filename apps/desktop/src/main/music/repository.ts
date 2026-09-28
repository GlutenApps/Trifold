import { readdir, stat, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
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

  private async scanNow(onProgress?: (p: MusicScanProgress) => void): Promise<MusicLibraryView> {
    const lib = await this.load();
    const known = new Map(lib.tracks.map((t) => [t.path.toLowerCase(), t]));
    const files: string[] = [];
    for (const folder of lib.folders) {
      await walk(folder, files, this.logger);
      onProgress?.({ phase: 'listing', read: 0, found: files.length, added: 0 });
    }
    let read = 0;
    let added = 0;
    for (const file of files) {
      read += 1;
      if (known.has(file.toLowerCase())) continue;
      onProgress?.({ phase: 'reading', read, found: files.length, added, current: basename(file) });
      const track = await this.readTrack(file);
      lib.tracks.push(track);
      known.set(file.toLowerCase(), track);
      added += 1;
    }
    lib.lastScanAt = nowIso();
    await this.save();
    onProgress?.({ phase: 'done', read, found: files.length, added });
    this.logger.info(`music scan: ${files.length} files, ${added} new`);
    return this.view();
  }

  private async readTrack(file: string): Promise<Track> {
    const fallbackTitle = basename(file, extname(file));
    try {
      const meta = await parseFile(file, { duration: true, skipCovers: true });
      return Track.parse({
        id: ulid(),
        path: file,
        title: meta.common.title?.trim() || fallbackTitle,
        ...(meta.common.artist ? { artist: meta.common.artist } : {}),
        ...(meta.common.album ? { album: meta.common.album } : {}),
        durationSec: meta.format.duration ?? 0,
        addedAt: nowIso(),
      });
    } catch (err) {
      this.logger.warn(`could not read tags from ${file}: ${String(err)}`);
      return Track.parse({ id: ulid(), path: file, title: fallbackTitle, addedAt: nowIso() });
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

async function walk(dir: string, out: string[], logger: Logger): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.warn(`music folder unreadable: ${dir} (${String(err)})`);
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out, logger);
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      out.push(full);
  }
}
