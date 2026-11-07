import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupService, COPY_SUBFOLDER, copiesToPrune, type BackupCopyTarget } from './backups';
import { LibraryStore } from './library/LibraryStore';
import type { Logger } from './log';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function entriesOf(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const names: string[] = [];
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err);
      zipfile.on('entry', (entry: yauzl.Entry) => {
        names.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(names.sort()));
      zipfile.readEntry();
    });
  });
}

async function makeZip(target: string, files: Record<string, string>): Promise<string> {
  const zip = new yazl.ZipFile();
  for (const [path, body] of Object.entries(files)) zip.addBuffer(Buffer.from(body), path);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(target));
  return target;
}

describe('BackupService', () => {
  let root: string;
  let store: LibraryStore;
  let service: BackupService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-backup-'));
    store = await LibraryStore.open(root);
    await mkdir(join(root, 'campaigns', 'one'), { recursive: true });
    await writeFile(join(root, 'campaigns', 'one', 'campaign.json'), '{"name":"one"}');
    await writeFile(join(root, 'music', 'library.json'), '{"tracks":[]}');
    await writeFile(join(root, 'index.sqlite'), 'binary');
    await writeFile(join(root, 'logs', 'today.log'), 'log');
    await writeFile(join(root, 'campaigns', 'one', 'campaign.json.tmp'), 'partial');
    service = new BackupService(store, logger);
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('zips everything except the index, logs, backups and temp files, plus a manifest', async () => {
    const info = await service.create('manual');
    expect(info?.kind).toBe('manual');
    const names = await entriesOf(join(root, 'backups', info!.name));
    expect(names).toEqual([
      'campaigns/one/campaign.json',
      'library.json',
      'manifest.json',
      'music/library.json',
    ]);
  });

  it('describes itself in a manifest that inspect reads back', async () => {
    const info = await service.create('manual');
    const file = await service.inspect(join(root, 'backups', info!.name));
    expect(file.problem).toBeNull();
    expect(file.manifest).toMatchObject({
      kind: 'library',
      counts: { campaigns: 1, homebrew: 0, sources: 0 },
    });
  });

  it('writes one daily zip per day and prunes old ones', async () => {
    const first = await service.runDailyIfDue(14);
    expect(first?.kind).toBe('daily');
    expect(await service.runDailyIfDue(14)).toBeNull();
    const old = join(root, 'backups', '2020-01-01.zip');
    await writeFile(old, 'x');
    const past = new Date('2020-01-01T00:00:00Z');
    await utimes(old, past, past);
    await service.runDailyIfDue(14);
    const names = (await service.list()).map((b) => b.name);
    expect(names).toEqual([first!.name]);
  });

  it('replaces the Library with a backup after a safety zip, refusing escapes', async () => {
    const backup = await service.create('manual');
    await writeFile(join(root, 'campaigns', 'one', 'campaign.json'), '{"name":"changed"}');
    await mkdir(join(root, 'campaigns', 'two'), { recursive: true });
    await writeFile(join(root, 'campaigns', 'two', 'campaign.json'), '{"name":"two"}');
    const result = await service.restore(backup!.name);
    expect(result.restored).toBe(3);
    expect(result.safety).toMatch(/-pre-restore\.zip$/);
    expect(await readFile(join(root, 'campaigns', 'one', 'campaign.json'), 'utf8')).toBe(
      '{"name":"one"}',
    );
    // Replace, not merge: a campaign made after the backup is gone (it is in the safety zip).
    expect(await readdir(join(root, 'campaigns'))).toEqual(['one']);
    // The manifest describes the zip; it is never written into the Library.
    await expect(stat(join(root, 'manifest.json'))).rejects.toThrow();
    // Logs and backups are never cleared.
    expect(await readFile(join(root, 'logs', 'today.log'), 'utf8')).toBe('log');
    const kinds = (await service.list()).map((b) => b.kind).sort();
    expect(kinds).toEqual(['manual', 'preRestore']);
    await expect(service.restore('../evil.zip')).rejects.toThrow('Not a backup file');
  });

  it('restores a zip from anywhere on disk', async () => {
    const backup = await service.create('manual');
    const elsewhere = await mkdtemp(join(tmpdir(), 'trifold-elsewhere-'));
    try {
      const copy = join(elsewhere, 'from-old-laptop.zip');
      await writeFile(copy, await readFile(join(root, 'backups', backup!.name)));
      await rm(join(root, 'campaigns', 'one'), { recursive: true });
      await service.restoreFile(copy);
      expect(await readFile(join(root, 'campaigns', 'one', 'campaign.json'), 'utf8')).toBe(
        '{"name":"one"}',
      );
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it('refuses a newer, a campaign or a foreign zip before changing anything', async () => {
    const manifest = (patch: object) =>
      JSON.stringify({
        kind: 'library',
        appVersion: '9.0.0',
        librarySchemaVersion: 1,
        campaignSchemaVersion: 1,
        createdAt: '2026-11-07T00:00:00Z',
        counts: { campaigns: 0, homebrew: 0, sources: 0 },
        ...patch,
      });
    const newer = await makeZip(join(root, 'newer.zip'), {
      'manifest.json': manifest({ librarySchemaVersion: 999 }),
      'library.json': '{}',
    });
    const campaign = await makeZip(join(root, 'campaign.zip'), {
      'manifest.json': manifest({ kind: 'campaign' }),
    });
    const foreign = await makeZip(join(root, 'photos.zip'), { 'cat.jpg': 'meow' });
    const legacy = await makeZip(join(root, 'legacy.zip'), { 'library.json': '{}' });

    expect((await service.inspect(newer)).problem).toMatch(/newer Trifold \(9\.0\.0\)/);
    expect((await service.inspect(campaign)).problem).toMatch(/campaign export/);
    expect((await service.inspect(foreign)).problem).toMatch(/Not a Trifold Library backup/);
    // A zip from before manifests still restores.
    expect((await service.inspect(legacy)).problem).toBeNull();

    await expect(service.restoreFile(newer)).rejects.toThrow(/newer Trifold/);
    expect(await readFile(join(root, 'campaigns', 'one', 'campaign.json'), 'utf8')).toBe(
      '{"name":"one"}',
    );
    expect(await service.list()).toEqual([]);
  });

  it('writes an on-close zip only when the session changed the Library', async () => {
    expect(await service.runOnQuitIfChanged(14)).toBeNull();
    await service.create('daily');
    await new Promise((done) => setTimeout(done, 20));
    await store.writeJson('campaigns/one/campaign.json', { name: 'edited' });
    const quit = await service.runOnQuitIfChanged(14);
    expect(quit?.kind).toBe('quit');
    expect(quit?.name).toMatch(/^\d{4}-\d{2}-\d{2}-quit\.zip$/);
    // Nothing written since: no second one.
    expect(await service.runOnQuitIfChanged(14)).toBeNull();
  });
});

describe('BackupService second location', () => {
  let root: string;
  let away: string;
  let store: LibraryStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-backup-'));
    away = await mkdtemp(join(tmpdir(), 'trifold-away-'));
    store = await LibraryStore.open(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(away, { recursive: true, force: true });
  });

  const target = (folder: string | null) => {
    const reports: Parameters<BackupCopyTarget['report']>[0][] = [];
    const copy: BackupCopyTarget = { folder: () => folder, report: (r) => reports.push(r) };
    return { copy, reports };
  };

  it('copies each zip into a folder named for the Library, but not pre-restore zips', async () => {
    const { copy, reports } = target(away);
    const service = new BackupService(store, logger, { appVersion: '1.2.3', copy });
    const daily = await service.create('daily');
    await service.create('preRestore');
    const dir = join(away, COPY_SUBFOLDER, basename(root));
    expect(service.copyTarget()).toBe(dir);
    expect(await readdir(dir)).toEqual([daily!.name]);
    expect(reports).toEqual([{ ok: true, at: expect.any(String) }]);
    const file = await service.inspect(join(dir, daily!.name));
    expect(file.manifest?.appVersion).toBe('1.2.3');
  });

  it('reports a folder it cannot reach and still keeps the zip in the Library', async () => {
    const { copy, reports } = target(join(away, 'unplugged-drive'));
    const service = new BackupService(store, logger, { appVersion: '1', copy });
    const daily = await service.create('daily');
    expect(daily?.kind).toBe('daily');
    expect((await service.list()).map((b) => b.name)).toEqual([daily!.name]);
    expect(reports).toEqual([{ ok: false, error: expect.stringMatching(/can't be reached/) }]);
    // Nothing is created in place of a missing folder.
    expect(await readdir(away)).toEqual([]);
  });

  it('does nothing when copying is off', async () => {
    const { copy, reports } = target(null);
    const service = new BackupService(store, logger, { appVersion: '1', copy });
    await service.create('manual');
    expect(service.copyTarget()).toBeNull();
    expect(reports).toEqual([]);
  });
});

describe('copiesToPrune', () => {
  it('keeps keepDays of zips, then the newest of each week for 8 weeks', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    const names = [
      '2026-11-07.zip',
      '2026-11-07-quit.zip',
      '2026-11-01.zip', // 6 days: kept by keepDays
      '2026-10-20.zip', // past keepDays, in the week of 19 Oct, not its newest: pruned
      '2026-10-22-quit.zip', // newest of that week: kept
      '2026-10-22.zip', // same week, older name: pruned
      '2026-09-08.zip', // 60 days: past the weekly window
      '2026-10-30-pre-restore.zip', // never subject to the copy folder's rule
      'notes.txt', // not a backup: never touched
    ];
    expect(copiesToPrune(names, 7, now).sort()).toEqual([
      '2026-09-08.zip',
      '2026-10-20.zip',
      '2026-10-22.zip',
    ]);
  });
});
