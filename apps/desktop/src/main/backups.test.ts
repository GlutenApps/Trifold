import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yauzl from 'yauzl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupService } from './backups';
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

  it('zips everything except the index, logs, backups and temp files', async () => {
    const info = await service.create('manual');
    expect(info?.kind).toBe('manual');
    const names = await entriesOf(join(root, 'backups', info!.name));
    expect(names).toEqual(['campaigns/one/campaign.json', 'library.json', 'music/library.json']);
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

  it('restores files over the Library after a safety zip, refusing escapes', async () => {
    const backup = await service.create('manual');
    await writeFile(join(root, 'campaigns', 'one', 'campaign.json'), '{"name":"changed"}');
    const result = await service.restore(backup!.name);
    expect(result.restored).toBe(3);
    expect(result.safety).toMatch(/-pre-restore\.zip$/);
    expect(await readFile(join(root, 'campaigns', 'one', 'campaign.json'), 'utf8')).toBe('{"name":"one"}');
    const kinds = (await service.list()).map((b) => b.kind).sort();
    expect(kinds).toEqual(['manual', 'preRestore']);
    await expect(service.restore('../evil.zip')).rejects.toThrow('Not a backup file');
  });
});
