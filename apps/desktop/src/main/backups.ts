import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { BackupFileInfo, BackupInfo, BackupManifest } from '@trifold/api';
import {
  CAMPAIGN_SCHEMA_VERSION,
  CampaignExportOptions,
  LIBRARY_SCHEMA_VERSION,
} from '@trifold/schema';
import type { LibraryStore } from './library/LibraryStore';
import { errorMessage, type Logger } from './log';

/** Top-level Library entries that never go into a backup (DESIGN.md §4.2). */
const SKIP_TOP_LEVEL = new Set([
  'backups',
  'logs',
  'index.sqlite',
  'index.sqlite-wal',
  'index.sqlite-shm',
  'index.sqlite-journal',
]);
const MANIFEST = 'manifest.json';
const ZIP_NAME = /^(\d{4}-\d{2}-\d{2})(-\d{6})?(-pre-restore|-quit)?\.zip$/;
/** The second location keeps one zip a week for this long beyond `keepDays` (ADR 0015). */
const WEEKLY_KEEP_DAYS = 56;
/** The folder inside the chosen copy folder that holds every Library's zips. */
export const COPY_SUBFOLDER = 'Trifold backups';

type Kind = BackupInfo['kind'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function stamp(): string {
  const d = new Date();
  const two = (n: number) => n.toString().padStart(2, '0');
  return `${today()}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

function kindOf(name: string): Kind {
  const match = ZIP_NAME.exec(name);
  if (match?.[3] === '-pre-restore') return 'preRestore';
  if (match?.[3] === '-quit') return 'quit';
  return match?.[2] ? 'manual' : 'daily';
}

function zipNameFor(kind: Kind): string {
  switch (kind) {
    case 'daily':
      return `${today()}.zip`;
    // One on-close zip a day, replaced at each close: the day's last state.
    case 'quit':
      return `${today()}-quit.zip`;
    case 'manual':
      return `${stamp()}.zip`;
    case 'preRestore':
      return `${stamp()}-pre-restore.zip`;
  }
}

/** Whole days between a `YYYY-MM-DD` and today, both read as UTC dates. */
function ageInDays(date: string, now: Date): number {
  const then = Date.parse(`${date}T00:00:00Z`);
  const day = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((day - then) / 86_400_000);
}

/** The Monday that starts the week holding `date` (ISO weeks). */
function weekOf(date: string): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/** Sorts a day's zips in the order they are written: daily at open, manual by time, on-close last. */
function orderKey(name: string): string {
  const match = ZIP_NAME.exec(name);
  const kind = kindOf(name);
  const within = kind === 'daily' ? '0' : kind === 'quit' ? '2' : `1${match?.[2] ?? ''}`;
  return `${match?.[1] ?? ''}${within}`;
}

/**
 * Which zips in the second location to delete: anything past `keepDays` except the newest of
 * each week for `WEEKLY_KEEP_DAYS`. Pure, so the rule is tested without a clock.
 */
export function copiesToPrune(names: string[], keepDays: number, now: Date): string[] {
  const dated = names
    .map((name) => ({ name, date: ZIP_NAME.exec(name)?.[1] }))
    .filter(
      (x): x is { name: string; date: string } => !!x.date && kindOf(x.name) !== 'preRestore',
    );
  const newestOfWeek = new Map<string, string>();
  for (const { name, date } of dated) {
    const week = weekOf(date);
    const held = newestOfWeek.get(week);
    if (!held || orderKey(name) > orderKey(held)) newestOfWeek.set(week, name);
  }
  return dated
    .filter(({ name, date }) => {
      const age = ageInDays(date, now);
      if (age <= keepDays) return false;
      return !(age <= WEEKLY_KEEP_DAYS && newestOfWeek.get(weekOf(date)) === name);
    })
    .map((x) => x.name);
}

/** Reads a manifest written by any Trifold; null when it is not one. */
export function parseManifest(raw: unknown): BackupManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<BackupManifest>;
  if (m.kind !== 'library' && m.kind !== 'campaign') return null;
  if (typeof m.librarySchemaVersion !== 'number' || typeof m.campaignSchemaVersion !== 'number') {
    return null;
  }
  const c = m.campaign;
  const options = CampaignExportOptions.safeParse(c?.options ?? {});
  const campaign =
    c && typeof c.id === 'string' && typeof c.name === 'string'
      ? {
          id: c.id,
          name: c.name,
          pcs: typeof c.pcs === 'number' ? c.pcs : 0,
          options: options.success ? options.data : CampaignExportOptions.parse({}),
        }
      : undefined;
  return {
    ...(campaign ? { campaign } : {}),
    kind: m.kind,
    appVersion: typeof m.appVersion === 'string' ? m.appVersion : '',
    librarySchemaVersion: m.librarySchemaVersion,
    campaignSchemaVersion: m.campaignSchemaVersion,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : '',
    counts: {
      campaigns: m.counts?.campaigns ?? 0,
      homebrew: m.counts?.homebrew ?? 0,
      sources: m.counts?.sources ?? 0,
    },
  };
}

/** Lists a zip's entry names and reads its manifest, without extracting anything. */
export function readZipSummary(zipPath: string): Promise<{ names: string[]; manifest: unknown }> {
  return new Promise((done, fail) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return fail(err ?? new Error('could not open the zip'));
      const names: string[] = [];
      let manifest: unknown = null;
      zipfile.on('error', fail);
      zipfile.on('end', () => done({ names, manifest }));
      zipfile.on('entry', (entry: yauzl.Entry) => {
        names.push(entry.fileName);
        if (entry.fileName !== MANIFEST) return zipfile.readEntry();
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return fail(streamErr ?? new Error('bad manifest'));
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('error', fail);
          stream.on('end', () => {
            try {
              manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              manifest = null;
            }
            zipfile.readEntry();
          });
        });
      });
      zipfile.readEntry();
    });
  });
}

/** Where a copy goes and how it went; `BackupService` never throws over a copy. */
export interface BackupCopyTarget {
  /** The folder the DM chose, or null when copying is off. */
  folder(): string | null;
  report(result: { ok: true; at: string } | { ok: false; error: string }): void;
}

export interface BackupOptions {
  appVersion: string;
  copy?: BackupCopyTarget;
}

/**
 * Rolling zips of the Library (CLAUDE.md ground rule 6, ADR 0015): every file except the derived
 * index, the logs and earlier backups, plus a manifest. Music files live outside the Library and
 * are referenced by path, so `music/library.json` is included but no audio is. Each zip except a
 * pre-restore one is also copied to the second location when one is set. Restore replaces the
 * Library's contents with the zip's after writing a safety zip; the caller reopens the Library so
 * the index is rebuilt from the restored files.
 */
export class BackupService {
  private running: Promise<BackupInfo | null> | null = null;

  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
    private readonly options: BackupOptions = { appVersion: '' },
  ) {}

  get dir(): string {
    return join(this.store.root, 'backups');
  }

  /** This Library's folder inside the chosen copy folder, or null when copying is off. */
  copyTarget(folder = this.options.copy?.folder() ?? null): string | null {
    return folder ? join(folder, COPY_SUBFOLDER, basename(this.store.root)) : null;
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
        kind: kindOf(name),
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

  /**
   * At close: writes the day's on-close zip when this session wrote to the Library after the
   * newest backup, so the session's work leaves the computer that evening.
   */
  async runOnQuitIfChanged(keepDays: number): Promise<BackupInfo | null> {
    const changedAt = this.store.lastWriteAt;
    if (changedAt === null) return null;
    const newest = (await this.list()).find((b) => b.kind !== 'preRestore');
    if (newest && Date.parse(newest.createdAt) >= changedAt) return null;
    const created = await this.create('quit');
    await this.prune(keepDays);
    return created;
  }

  async create(kind: Kind = 'manual'): Promise<BackupInfo | null> {
    if (this.running) return this.running;
    this.running = this.createNow(kind).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async createNow(kind: Kind): Promise<BackupInfo | null> {
    await mkdir(this.dir, { recursive: true });
    const name = zipNameFor(kind);
    const target = join(this.dir, name);
    const partial = `${target}.partial`;
    const zip = new yazl.ZipFile();
    const files = await this.walk(this.store.root, '');
    for (const file of files) {
      zip.addFile(join(this.store.root, file), file.split(sep).join('/'));
    }
    zip.addBuffer(Buffer.from(JSON.stringify(await this.manifest(), null, 2)), MANIFEST);
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(partial));
    await rename(partial, target);
    const info = await stat(target);
    this.logger.info(`backup written: ${name} (${files.length} files, ${info.size} bytes)`);
    if (kind !== 'preRestore') await this.copyOut(name);
    return { name, sizeBytes: info.size, createdAt: info.mtime.toISOString(), kind };
  }

  private async manifest(): Promise<BackupManifest> {
    const count = async (rel: string, pick: (e: { name: string; isDir: boolean }) => boolean) => {
      try {
        const entries = await readdir(join(this.store.root, rel), { withFileTypes: true });
        return entries.filter((e) => pick({ name: e.name, isDir: e.isDirectory() })).length;
      } catch {
        return 0;
      }
    };
    return {
      kind: 'library',
      appVersion: this.options.appVersion,
      librarySchemaVersion: LIBRARY_SCHEMA_VERSION,
      campaignSchemaVersion: CAMPAIGN_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      counts: {
        campaigns: await count('campaigns', (e) => e.isDir),
        homebrew: await count('homebrew', (e) => !e.isDir && e.name.endsWith('.json')),
        sources: await count('sources', (e) => e.isDir),
      },
    };
  }

  /** Copies a finished zip to the second location and prunes there. Reports, never throws. */
  private async copyOut(name: string): Promise<void> {
    const copy = this.options.copy;
    const folder = copy?.folder() ?? null;
    const target = this.copyTarget(folder);
    if (!copy || !folder || !target) return;
    try {
      try {
        if (!(await stat(folder)).isDirectory()) throw new Error('not a folder');
      } catch {
        throw new Error(`${folder} can't be reached`);
      }
      await mkdir(target, { recursive: true });
      const partial = join(target, `${name}.partial`);
      await copyFile(join(this.dir, name), partial);
      await rename(partial, join(target, name));
      const keepDays = this.store.getSettings().backups.keepDays;
      const prunable = copiesToPrune(await readdir(target), keepDays, new Date());
      for (const old of prunable) await rm(join(target, old), { force: true });
      this.logger.info(
        `backup copied to ${target}${prunable.length ? `; pruned ${prunable.join(', ')}` : ''}`,
      );
      copy.report({ ok: true, at: new Date().toISOString() });
    } catch (err) {
      const error = errorMessage(err);
      this.logger.error(`backup copy failed: ${error}`);
      copy.report({ ok: false, error });
    }
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

  /** Removes daily, manual and on-close zips older than `keepDays`; pre-restore zips are kept for 30 days. */
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

  /** Reads a zip anywhere on disk and says whether it can be restored, changing nothing. */
  async inspect(zipPath: string): Promise<BackupFileInfo> {
    const info = await stat(zipPath);
    const base = { path: zipPath, name: basename(zipPath), sizeBytes: info.size };
    let summary: { names: string[]; manifest: unknown };
    try {
      summary = await readZipSummary(zipPath);
    } catch (err) {
      return {
        ...base,
        manifest: null,
        problem: `Not a zip Trifold can read (${errorMessage(err)})`,
      };
    }
    const manifest = parseManifest(summary.manifest);
    let problem: string | null = null;
    if (manifest?.kind === 'campaign') {
      problem = 'This is a campaign export, not a Library backup';
    } else if (
      manifest &&
      (manifest.librarySchemaVersion > LIBRARY_SCHEMA_VERSION ||
        manifest.campaignSchemaVersion > CAMPAIGN_SCHEMA_VERSION)
    ) {
      problem = `Made by a newer Trifold${manifest.appVersion ? ` (${manifest.appVersion})` : ''}; update Trifold to restore it`;
    } else if (!manifest && !summary.names.includes('library.json')) {
      problem = 'Not a Trifold Library backup';
    }
    return { ...base, manifest, problem };
  }

  /** Restores a zip from the Library's backups folder. */
  async restore(name: string): Promise<{ restored: number; safety: string | null }> {
    if (!ZIP_NAME.test(name)) throw new Error('Not a backup file');
    return this.restoreFile(join(this.dir, name));
  }

  /**
   * Replaces the Library with a backup's contents: a safety zip is written first, then every
   * top-level entry the zip holds is cleared and extracted, so the result is the backup's state.
   * Entries that would escape the Library are refused; `backups/` and `logs/` are never touched.
   */
  async restoreFile(zipPath: string): Promise<{ restored: number; safety: string | null }> {
    const checked = await this.inspect(zipPath);
    if (checked.problem) throw new Error(checked.problem);
    const { names } = await readZipSummary(zipPath);
    const safety = await this.create('preRestore');
    const root = resolve(this.store.root);

    const topLevel = new Set(
      names
        .map((n) => posix.normalize(n).split('/')[0] ?? '')
        .filter((n) => n && n !== '..' && n !== MANIFEST && !SKIP_TOP_LEVEL.has(n)),
    );
    for (const name of topLevel) await rm(join(root, name), { recursive: true, force: true });

    let restored = 0;
    await new Promise<void>((done, fail) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return fail(err ?? new Error('could not open backup'));
        zipfile.on('error', fail);
        zipfile.on('end', done);
        zipfile.on('entry', (entry: yauzl.Entry) => {
          const relPath = posix.normalize(entry.fileName);
          const top = relPath.split('/')[0] ?? '';
          if (
            /\/$/.test(entry.fileName) ||
            relPath === MANIFEST ||
            SKIP_TOP_LEVEL.has(top) ||
            relPath.startsWith('..') ||
            posix.isAbsolute(relPath)
          ) {
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
    this.logger.info(`restored ${restored} files from ${zipPath}`);
    return { restored, safety: safety?.name ?? null };
  }
}
