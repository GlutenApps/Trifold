import { bookKey, unnamedBookKey } from '@trifold/rules';
import type { CompendiumRecord, RecordKind, Source } from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';
import type { SourceRepository } from './repository';

/**
 * Deleting books (ADR 0065). A book is part of an imported file, so deleting it rewrites that
 * file's records without the book and remembers the book in `source.json` (`deletedBooks`), so
 * Re-parse leaves it out too. A file left with no records is removed. Importing the file again
 * starts its list afresh.
 */

/** A record's book as the Books tab lists it (ADR 0061): its book key, or the file's unnamed one. */
export function bookOfRecord(record: Pick<CompendiumRecord, 'sourceBook'>, sourceId: string) {
  return record.sourceBook ? bookKey(record.sourceBook) : unnamedBookKey(sourceId);
}

/** How many records of each kind, as `source.json` keeps them. */
export function countsOf(
  records: readonly CompendiumRecord[],
): Partial<Record<RecordKind, number>> {
  const counts: Partial<Record<RecordKind, number>> = {};
  for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}

export interface DeletedBooks {
  /** How many records left the Library. */
  records: number;
  /** The files a book was deleted from, removed ones included. */
  files: string[];
  /** The files removed because no record was left in them. */
  removedFiles: string[];
}

/** Deletes `keys` from each of `fileIds` that is an imported XML file. */
export async function deleteBooks(
  ctx: { sources: SourceRepository; index: Pick<IndexDb, 'replaceSource' | 'removeSource'> },
  keys: readonly string[],
  fileIds: readonly string[],
): Promise<DeletedBooks> {
  const wanted = new Set(keys);
  const out: DeletedBooks = { records: 0, files: [], removedFiles: [] };
  for (const id of fileIds) {
    const source = await ctx.sources.get(id);
    // Bundled and opted-in documents come back on the next sync; only an import is the DM's.
    if (!source || source.kind !== 'xml') continue;
    const all = await ctx.sources.readAllRecords(id);
    const kept: CompendiumRecord[] = [];
    const gone = new Set<string>();
    for (const r of all) {
      const book = bookOfRecord(r, id);
      if (wanted.has(book)) gone.add(book);
      else kept.push(r);
    }
    if (gone.size === 0) continue;
    out.records += all.length - kept.length;
    out.files.push(id);
    if (kept.length === 0) {
      await ctx.sources.remove(id);
      ctx.index.removeSource(id);
      out.removedFiles.push(id);
      continue;
    }
    const next: Source = {
      ...source,
      deletedBooks: [...new Set([...(source.deletedBooks ?? []), ...gone])],
      recordCounts: countsOf(kept),
    };
    await ctx.sources.writeRecords(id, kept);
    await ctx.sources.write(next);
    ctx.index.replaceSource(next, kept);
  }
  return out;
}

/**
 * The Library's duplicate choices (ADR 0063) without those that pick a copy from a deleted book:
 * a choice is `sourceId|bookKey|edition`, and a file's unnamed book is `sourceId||edition`.
 */
export function withoutDeletedChoices(
  choices: Readonly<Record<string, string>>,
  keys: readonly string[],
  fileIds: readonly string[],
  removedFiles: readonly string[],
): Record<string, string> {
  const files = new Set(fileIds);
  const removed = new Set(removedFiles);
  const books = new Set(keys);
  const next: Record<string, string> = {};
  for (const [group, copy] of Object.entries(choices)) {
    const [sourceId = '', book = ''] = copy.split('|');
    const key = book || unnamedBookKey(sourceId);
    if (removed.has(sourceId) || (files.has(sourceId) && books.has(key))) continue;
    next[group] = copy;
  }
  return next;
}
