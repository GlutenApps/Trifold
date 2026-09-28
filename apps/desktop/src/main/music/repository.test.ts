import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { MusicRepository } from './repository';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** A valid 16-bit mono PCM WAV of `seconds` at 8 kHz, silent. */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('MusicRepository', () => {
  let root: string;
  let musicDir: string;
  let store: LibraryStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-music-'));
    musicDir = join(root, 'songs');
    await mkdir(join(musicDir, 'nested'), { recursive: true });
    await writeFile(join(musicDir, 'Tavern Night.wav'), wav(2));
    await writeFile(join(musicDir, 'nested', 'battle.wav'), wav(1));
    await writeFile(join(musicDir, 'notes.txt'), 'not audio');
    store = await LibraryStore.open(join(root, 'Library'));
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('scans folders recursively, reads durations and keeps files in place', async () => {
    const repo = new MusicRepository(store, logger);
    const progress: string[] = [];
    const view = await repo.addFolder(musicDir, (p) => progress.push(p.phase));
    expect(view.folders).toEqual([musicDir]);
    expect(view.tracks.map((t) => t.title).sort()).toEqual(['Tavern Night', 'battle']);
    const tavern = view.tracks.find((t) => t.title === 'Tavern Night')!;
    expect(tavern.durationSec).toBeCloseTo(2, 1);
    expect(tavern.available).toBe(true);
    expect(tavern.gainDb).toBeNull();
    expect(progress.at(-1)).toBe('done');
    expect(repo.trackPath(tavern.id)).toBe(join(musicDir, 'Tavern Night.wav'));
    expect(repo.trackPath('nope')).toBeNull();
    const onDisk = JSON.parse(
      await readFile(join(root, 'Library', 'music', 'library.json'), 'utf8'),
    );
    expect(onDisk.tracks).toHaveLength(2);
  });

  it('keeps edits across rescans and marks missing files unavailable', async () => {
    const repo = new MusicRepository(store, logger);
    const first = await repo.addFolder(musicDir);
    const battle = first.tracks.find((t) => t.title === 'battle')!;
    await repo.updateTrack(battle.id, { kind: 'ambience', tags: ['combat'], gainDb: -3.5 });
    await writeFile(join(musicDir, 'new.wav'), wav(1));
    await rm(join(musicDir, 'Tavern Night.wav'));
    const second = await repo.rescanForTest();
    expect(second.tracks).toHaveLength(3);
    const kept = second.tracks.find((t) => t.id === battle.id)!;
    expect(kept).toMatchObject({ kind: 'ambience', tags: ['combat'], gainDb: -3.5 });
    expect(second.tracks.find((t) => t.title === 'Tavern Night')?.available).toBe(false);
  });

  it('forgets a folder with its tracks, and stores playlists as files', async () => {
    const repo = new MusicRepository(store, logger);
    await repo.addFolder(musicDir);
    const after = await repo.removeFolder(musicDir);
    expect(after.folders).toEqual([]);
    expect(after.tracks).toEqual([]);

    const saved = await repo.savePlaylist({
      schemaVersion: 1,
      id: '',
      name: 'Travel',
      trackIds: ['a', 'b'],
      shuffle: true,
      loop: true,
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    });
    expect(saved.id).not.toBe('');
    expect((await repo.listPlaylists()).map((p) => p.name)).toEqual(['Travel']);
    await repo.removePlaylist(saved.id);
    expect(await repo.listPlaylists()).toEqual([]);
  });
});
