import { normalizeKey } from './normalizeKey';

/**
 * The books an imported compendium file names, and the clash that says some of them need
 * marking as 2024 rules (ADR 0028): the same name, kind and edition from two different books.
 * Two copies from one book are left alone; marking a book cannot tell them apart.
 */
export interface ReviewableRecord {
  kind: string;
  key: string;
  edition: string;
  sourceBook?: string | undefined;
}

export interface BookReview {
  /** Every book named on a Source line, by name, with how many records it has. */
  books: Array<{ name: string; records: number }>;
  /** Per kind, how many names appear more than once from different books in the same edition. */
  duplicates: Partial<Record<string, number>>;
}

export function reviewBooks(records: Iterable<ReviewableRecord>): BookReview {
  const books = new Map<string, { name: string; records: number }>();
  const groups = new Map<string, { kind: string; books: Set<string> }>();
  for (const r of records) {
    const book = r.sourceBook?.trim();
    if (!book) continue;
    const bookKey = normalizeKey(book);
    const entry = books.get(bookKey) ?? { name: book, records: 0 };
    entry.records += 1;
    books.set(bookKey, entry);
    const groupKey = `${r.kind}\u0000${r.key}\u0000${r.edition}`;
    const group = groups.get(groupKey) ?? { kind: r.kind, books: new Set<string>() };
    group.books.add(bookKey);
    groups.set(groupKey, group);
  }
  const duplicates: Partial<Record<string, number>> = {};
  for (const g of groups.values()) {
    if (g.books.size > 1) duplicates[g.kind] = (duplicates[g.kind] ?? 0) + 1;
  }
  return {
    books: [...books.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    ),
    duplicates,
  };
}

/** True when `book` is one of `marked` (matched as the importer matches, by normalized key). */
export function isMarked2024(book: string, marked: readonly string[]): boolean {
  const key = normalizeKey(book);
  return marked.some((m) => normalizeKey(m) === key);
}
