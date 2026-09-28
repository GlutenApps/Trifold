import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { BackupInfo } from '@trifold/api';
import type { LibraryStore } from './library/LibraryStore';
import type { Logger } from './log';

/** Top-level Library entries that never go into a backup (DESIGN.md §4.2). */
const SKIP_TOP_LEVEL = new Set(['backups', 'logs', 'index.sqlite', 'index.sqlite-wal', 'index.sqlite-shm', 'index.sqlite-journal']);
const ZIP_NAME = /^(\d{4}-\d{2}-\d{2})(-\d{6})?(-pre-restore)?\.zip$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function stamp(): string {
  const d = new Date();
  const two = (n: number) => n.toString().padStart(2, '0');
  return `${today()}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

/**
 * Daily rolling zip of the Library (CLAUDE.md ground rule 6): every file except the derived
 * index, the logs and earlier backups. Music files live outside the Library and are referenced
 * by path, so `music/library.json` is included but no audio is. Restore extracts a zip over the
 * Library after writing a safety zip first; the caller reopens the Library afterwards so the
 * index is rebuilt from the restored files.
 */
export class BackupService {
  private running: Promise<BackupInfo | null> | null = null;

  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
  ) {}

  get dir(): string {
    return join(this.store.root, 'backups');
  }

  async list(): Promise<BackupInfo[]> {
    let names: string[] = [];
    try {
      names = (await readdir(this.dir)).filter((n) => ZIP_NAME.test(n));
    } catch {
      return [];
    }
    const out: BackupInfo[] = [];
    for (const name of names) {
      const info = await stat(join(this.dir, name));
      out.push({
        name,
        sizeBytes: info.size,
        createdAt: info.mtime.toISOString(),
        kind: name.includes('-pre-restore') ? 'preRestore' : ZIP_NAME.exec(name)?.[2] ? 'manual' : 'daily',
      });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }

  /** Writes today's daily zip unless one exists, then prunes. Safe to call often. */
  async runDailyIfDue(keepDays: number): Promise<BackupInfo | null> {
    const existing = await this.list();
    const created = existing.some((b) => b.kind === 'daily' && b.name.startsWith(today()))
      ? null
      : await this.create('daily');
    await this.prune(keepDays);
    return created;
  }

  async create(kind: 'daily' | 'manual' | 'preRestore' = 'manual'): Promise<BackupInfo | null> {
    if (this.running) return this.running;
    this.running = this.createNow(kind).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async createNow(kind: 'daily' | 'manual' | 'preRestore'): Promise<BackupInfo | null> {
    await mkdir(this.dir, { recursive: true });
    const name =
      kind === 'daily' ? `${today()}.zip` : kind === 'manual' ? `${stamp()}.zip` : `${stamp()}-pre-restore.zip`;
    const target = join(this.dir, name);
    const partial = `${target}.partial`;
    const zip = new yazl.ZipFile();
    let files = 0;
    for (const file of await this.walk(this.store.root, '')) {
      zip.addFile(join(this.store.root, file), file.split(sep).join('/'));
      files += 1;
    }
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(partial));
    await rename(partial, target);
    const info = await stat(target);
    this.logger.info(`backup written: ${name} (${files} files, ${info.size} bytes)`);
    return { name, sizeBytes: info.size, createdAt: info.mtime.toISOString(), kind };
  }

  private async walk(root: string, rel: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await readdir(join(root, rel), { withFileTypes: true });
    for (const entry of entries) {
      if (!rel && SKIP_TOP_LEVEL.has(entry.name)) continue;
      if (entry.name.endsWith('.tmp') || entry.name.endsWith('.partial')) continue;
      const next = rel ? join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) out.push(...(await this.walk(root, next)));
      else if (entry.isFile()) out.push(next);
    }
    return out;
  }

  /** Removes daily and manual zips older than `keepDays`; pre-restore zips are kept for 30 days. */
  async prune(keepDays: number): Promise<string[]> {
    const removed: string[] = [];
    const now = Date.now();
    for (const backup of await this.list()) {
      const limit = backup.kind === 'preRestore' ? 30 : keepDays;
      const age = (now - new Date(backup.createdAt).getTime()) / 86_400_000;
      if (age > limit) {
        await rm(join(this.dir, backup.name), { force: true });
        removed.push(backup.name);
      }
    }
    if (removed.length) this.logger.info(`pruned backups: ${removed.join(', ')}`);
    return removed;
  }

  /**
   * Extracts a backup over the Library. Files not in the zip are left alone (nothing is deleted),
   * entries that would escape the Library are refused, and a pre-restore zip is written first.
   */
  async restore(name: string): Promise<{ restored: number; safety: string | null }> {
    if (!ZIP_NAME.test(name)) throw new Error('Not a backup file');
    const zipPath = join(this.dir, name);
    await stat(zipPath);
    const safety = await this.create('preRestore');
    const root = resolve(this.store.root);
    let restored = 0;
    await new Promise<void>((done, fail) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return fail(err ?? new Error('could not open backup'));
        zipfile.on('error', fail);
        zipfile.on('end', done);
        zipfile.on('entry', (entry: yauzl.Entry) => {
          const relPath = posix.normalize(entry.fileName);
          if (/\/$/.test(entry.fileName) || relPath.startsWith('..') || posix.isAbsolute(relPath)) {
            zipfile.readEntry();
            return;
          }
          const target = resolve(root, ...relPath.split('/'));
          if (relative(root, target).startsWith('..')) {
            this.logger.warn(`backup entry refused: ${entry.fileName}`);
            zipfile.readEntry();
            return;
          }
          zipfile.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) return fail(streamErr ?? new Error('bad entry'));
            void mkdir(dirname(target), { recursive: true })
              .then(() => pipeline(stream, createWriteStream(`${target}.partial`)))
              .then(() => rename(`${target}.partial`, target))
              .then(() => {
                restored += 1;
                zipfile.readEntry();
              })
              .catch(fail);
          });
        });
        zipfile.readEntry();
      });
    });
    this.logger.info(`restored ${restored} files from ${name}`);
    return { restored, safety: safety?.name ?? null };
  }
}
