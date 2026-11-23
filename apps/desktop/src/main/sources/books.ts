import type { BookSummary } from '@trifold/api';
import { bookTags, isMarked2024, unnamedBookKey } from '@trifold/rules';
import type { RecordKind } from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';

/**
 * Books (ADR 0061): what Library › Compendium › Sources lists as the unit a GM manages. Built
 * from the index, which knows every record's book, and the Library's book settings.
 */

type BookSettings = Readonly<Record<string, { starred: boolean; off: boolean }>>;

/** Every book in the imported files, named books by name, then each file's unnamed records. */
export function listBooks(index: Pick<IndexDb, 'bookRows'>, settings: BookSettings): BookSummary[] {
  const books = new Map<string, BookSummary>();
  for (const row of index.bookRows()) {
    const named = row.book_key !== '';
    const key = named ? row.book_key : unnamedBookKey(row.source_id);
    let book = books.get(key);
    if (!book) {
      const name = named ? row.book : row.source_name;
      book = {
        key,
        name,
        unnamed: !named,
        tags: named ? bookTags(name) : [],
        records: 0,
        counts: {},
        editions: { '2024': 0, '2014': 0, unknown: 0 },
        files: [],
        starred: settings[key]?.starred ?? false,
        off: settings[key]?.off ?? false,
      };
      books.set(key, book);
    }
    book.records += row.n;
    const kind = row.kind as RecordKind;
    book.counts[kind] = (book.counts[kind] ?? 0) + row.n;
    const edition = row.edition === '2024' || row.edition === '2014' ? row.edition : 'unknown';
    book.editions[edition] += row.n;
    const file = book.files.find((f) => f.id === row.source_id);
    if (file) file.records += row.n;
    else book.files.push({ id: row.source_id, name: row.source_name, records: row.n });
  }
  return [...books.values()].sort(
    (a, b) =>
      Number(a.unnamed) - Number(b.unnamed) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/** The Library's book settings after `patch` is applied to `keys`; defaults are left out. */
export function withBookSettings(
  current: BookSettings,
  keys: readonly string[],
  patch: { starred?: boolean; off?: boolean },
): Record<string, { starred: boolean; off: boolean }> {
  const next: Record<string, { starred: boolean; off: boolean }> = { ...current };
  for (const key of keys) {
    const merged = {
      starred: patch.starred ?? current[key]?.starred ?? false,
      off: patch.off ?? current[key]?.off ?? false,
    };
    if (merged.starred || merged.off) next[key] = merged;
    else delete next[key];
  }
  return next;
}

/**
 * A file's list of 2024 books (ADR 0028) with some of its books added or taken out. A book is
 * added by its exact name, so it marks that printing only; taking one out drops every entry
 * that would still mark it, matched as the importer matches (`isMarked2024`).
 */
export function with2024Books(
  marked: readonly string[],
  names: readonly string[],
  use2024: boolean,
): string[] {
  const kept = marked.filter((m) => !names.some((name) => isMarked2024(name, [m])));
  return use2024 ? [...kept, ...names] : kept;
}
