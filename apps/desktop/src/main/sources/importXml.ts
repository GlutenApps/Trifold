import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { ulid } from 'ulid';
import type { ImportProgress, ImportReport } from '@trifold/api';
import { createCompendiumImporter, detectXmlKind, IMPORTER_VERSION } from '@trifold/importers';
import { nowIso, type CompendiumRecord, type Source } from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import type { SourceRepository } from './repository';

export interface ImportContext {
  store: LibraryStore;
  sources: SourceRepository;
  /** Null when the index is unavailable; the files are still written. */
  index: IndexDb | null;
  logger: Logger;
  onProgress?: (progress: ImportProgress) => void;
}

export class ImportError extends Error {
  override name = 'ImportError';
}

async function hashFile(path: string, onBytes: (bytes: number) => void): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
    onBytes((chunk as Buffer).length);
  }
  return `sha256:${hash.digest('hex')}`;
}

async function readHead(path: string, bytes: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

function matchKey(record: CompendiumRecord): string {
  return `${record.kind}:${record.key}:${record.edition}`;
}

function recordSignature(record: CompendiumRecord): string {
  const { id: _id, ...rest } = record;
  return JSON.stringify(rest);
}

/** True when a source's records were produced by an older importer. */
export function isStale(source: Source): boolean {
  return source.importerVersion < IMPORTER_VERSION;
}

/** Re-parses an existing source from its stored original.xml. */
export async function reimportSource(ctx: ImportContext, sourceId: string): Promise<ImportReport> {
  const existing = await ctx.sources.get(sourceId);
  if (!existing) throw new ImportError(`Source ${sourceId} not found`);
  const original = join(ctx.sources.dirFor(sourceId), existing.filePath ?? 'original.xml');
  return importXmlSource(ctx, original, existing);
}

/**
 * Imports a Lion's Den compendium XML file into `sources/<id>/` (DESIGN.md §6.1):
 * hash → skip if unchanged and parsed by the current importer; copy the original; stream-parse;
 * write records.jsonl and source.json; index. Re-importing a changed file keeps record ids stable
 * by key and reports a diff.
 */
export async function importXmlSource(
  ctx: ImportContext,
  filePath: string,
  target?: Source,
): Promise<ImportReport> {
  const started = performance.now();
  const info = await stat(filePath);
  const totalBytes = info.size;
  let bytesRead = 0;
  let recordCount = 0;
  const progress = (phase: ImportProgress['phase']) =>
    ctx.onProgress?.({ phase, records: recordCount, bytesRead, totalBytes });

  const kind = detectXmlKind(await readHead(filePath, 8192));
  if (kind === 'campaign') {
    throw new ImportError(
      'This is a campaign file. Campaign import arrives with the Campaign section; use Settings → Sources for compendium files.',
    );
  }
  if (kind !== 'compendium') {
    throw new ImportError("This file is not a Lion's Den compendium XML (no <compendium> root).");
  }

  progress('hashing');
  const fileHash = await hashFile(filePath, (n) => {
    bytesRead += n;
  });

  const name = target?.name ?? basename(filePath, extname(filePath));
  const existing =
    target ?? (await ctx.sources.list()).find((s) => s.kind === 'xml' && s.name === name);
  if (existing && existing.fileHash === fileHash && !isStale(existing)) {
    ctx.logger.info(`source "${name}" unchanged (hash match); nothing to do`);
    progress('done');
    return {
      sourceId: existing.id,
      name,
      status: 'unchanged',
      counts: existing.recordCounts,
      warnings: existing.warnings,
      durationMs: Math.round(performance.now() - started),
    };
  }

  const sourceId = existing?.id ?? ulid();
  const dir = ctx.sources.dirFor(sourceId);
  await mkdir(dir, { recursive: true });

  // Keep ids stable across re-imports so campaign references survive (DESIGN.md §5.4).
  // Records are matched by kind, key and edition, then by occurrence order for duplicates.
  const previous = new Map<string, Array<{ id: string; signature: string }>>();
  if (existing) {
    for await (const r of ctx.sources.readRecords(sourceId)) {
      const list = previous.get(matchKey(r)) ?? [];
      list.push({ id: r.id, signature: recordSignature(r) });
      previous.set(matchKey(r), list);
    }
  }

  const originalPath = join(dir, 'original.xml');
  if (resolve(filePath) !== resolve(originalPath)) {
    progress('copying');
    const tmpCopy = join(dir, `original.xml.${process.pid}.tmp`);
    try {
      await copyFile(filePath, tmpCopy);
      await rename(tmpCopy, originalPath);
    } catch (err) {
      await unlink(tmpCopy).catch(() => undefined);
      throw err;
    }
  }

  progress('parsing');
  bytesRead = 0;
  const settings = ctx.store.getSettings();
  const records: CompendiumRecord[] = [];
  const occurrences = new Map<string, number>();
  const importer = createCompendiumImporter(
    {
      sourceId,
      defaultEdition: existing?.defaultEdition ?? '2014',
      edition2024Books: existing?.edition2024Books ?? settings.edition2024Books,
    },
    (record) => {
      const keyed = matchKey(record);
      const n = occurrences.get(keyed) ?? 0;
      occurrences.set(keyed, n + 1);
      const old = previous.get(keyed)?.[n];
      if (old) record.id = old.id;
      records.push(record);
      recordCount += 1;
      if (recordCount % 500 === 0) progress('parsing');
    },
  );
  const reader = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
  for await (const chunk of reader) {
    bytesRead += Buffer.byteLength(chunk as string, 'utf8');
    importer.write(chunk as string);
  }
  const stats = importer.end();

  let diff: ImportReport['diff'];
  if (existing) {
    let added = 0;
    let changed = 0;
    const counted = new Map<string, number>();
    for (const r of records) {
      const keyed = matchKey(r);
      const n = counted.get(keyed) ?? 0;
      counted.set(keyed, n + 1);
      const old = previous.get(keyed)?.[n];
      if (!old) added += 1;
      else if (old.signature !== recordSignature(r)) changed += 1;
    }
    let removed = 0;
    for (const [keyed, list] of previous) {
      removed += Math.max(0, list.length - (counted.get(keyed) ?? 0));
    }
    diff = { added, changed, removed };
  }

  progress('writing');
  const source: Source = {
    schemaVersion: 1,
    id: sourceId,
    name,
    kind: 'xml',
    filePath: 'original.xml',
    fileHash,
    enabled: existing?.enabled ?? true,
    defaultEdition: existing?.defaultEdition ?? '2014',
    edition2024Books: existing?.edition2024Books ?? settings.edition2024Books,
    license: existing?.license ?? { nonSrd: true, attribution: null },
    importedAt: nowIso(),
    importerVersion: IMPORTER_VERSION,
    recordCounts: stats.counts,
    warnings: stats.warnings,
  };
  await ctx.sources.writeRecords(sourceId, records);
  await ctx.sources.write(source);

  progress('indexing');
  if (ctx.index) {
    ctx.index.replaceSource(source, records);
  } else {
    ctx.logger.warn('index unavailable; source written to disk only');
  }

  const durationMs = Math.round(performance.now() - started);
  ctx.logger.info(
    `source "${name}" ${existing ? 'updated' : 'imported'}: ${records.length} records, ${stats.warnings.length} warnings, ${durationMs} ms`,
  );
  progress('done');
  return {
    sourceId,
    name,
    status: existing ? 'updated' : 'imported',
    counts: stats.counts,
    warnings: stats.warnings,
    durationMs,
    ...(diff ? { diff } : {}),
  };
}
