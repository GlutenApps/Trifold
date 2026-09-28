import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { ulid } from 'ulid';
import type { ImportProgress, ImportReport } from '@trifold/api';
import { createCompendiumImporter, detectXmlKind } from '@trifold/importers';
import { nowIso, type CompendiumRecord, type Source } from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import type { SourceRepository } from './repository';

export interface ImportContext {
  store: LibraryStore;
  sources: SourceRepository;
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

function recordSignature(record: CompendiumRecord): string {
  const { id: _id, ...rest } = record;
  return JSON.stringify(rest);
}

/**
 * Imports a Lion's Den compendium XML file into `sources/<id>/` (DESIGN.md §6.1):
 * hash → skip if unchanged; copy the original; stream-parse; write records.jsonl and source.json;
 * index. Re-importing a changed file keeps record ids stable by key and reports a diff.
 */
export async function importXmlSource(ctx: ImportContext, filePath: string): Promise<ImportReport> {
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

  const name = basename(filePath, extname(filePath));
  const existing = (await ctx.sources.list()).find((s) => s.kind === 'xml' && s.name === name);
  if (existing && existing.fileHash === fileHash) {
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
  const previous = new Map<string, { id: string; signature: string }>();
  if (existing) {
    for await (const r of ctx.sources.readRecords(sourceId)) {
      previous.set(`${r.kind}:${r.key}`, { id: r.id, signature: recordSignature(r) });
    }
  }

  progress('copying');
  const tmpCopy = join(dir, `original.xml.${process.pid}.tmp`);
  try {
    await copyFile(filePath, tmpCopy);
    await rename(tmpCopy, join(dir, 'original.xml'));
  } catch (err) {
    await unlink(tmpCopy).catch(() => undefined);
    throw err;
  }

  progress('parsing');
  bytesRead = 0;
  const settings = ctx.store.getSettings();
  const records: CompendiumRecord[] = [];
  const seenKeys = new Set<string>();
  const importer = createCompendiumImporter(
    {
      sourceId,
      defaultEdition: existing?.defaultEdition ?? '2014',
      edition2024Books: existing?.edition2024Books ?? settings.edition2024Books,
    },
    (record) => {
      const keyed = `${record.kind}:${record.key}`;
      const old = previous.get(keyed);
      if (old && !seenKeys.has(keyed)) record.id = old.id;
      seenKeys.add(keyed);
      records.push(record);
      recordCount += 1;
      if (recordCount % 500 === 0) progress('parsing');
    },
  );
  for await (const chunk of createReadStream(filePath, {
    encoding: 'utf8',
    highWaterMark: 1 << 20,
  })) {
    bytesRead += Buffer.byteLength(chunk as string, 'utf8');
    importer.write(chunk as string);
  }
  const stats = importer.end();

  let diff: ImportReport['diff'];
  if (existing) {
    let added = 0;
    let changed = 0;
    const current = new Set<string>();
    for (const r of records) {
      const keyed = `${r.kind}:${r.key}`;
      current.add(keyed);
      const old = previous.get(keyed);
      if (!old) added += 1;
      else if (old.signature !== recordSignature(r)) changed += 1;
    }
    const removed = [...previous.keys()].filter((k) => !current.has(k)).length;
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
