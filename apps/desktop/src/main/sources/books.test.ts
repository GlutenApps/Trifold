import { describe, expect, it } from 'vitest';
import {
  bookFilter,
  buildSearch,
  buildSuggest,
  buildTextSearch,
  campaignBooksFilter,
  PRIORITY,
} from '../index/query';
import { listBooks, with2024Books, withBookSettings } from './books';

const row = (
  book_key: string,
  book: string,
  source_id: string,
  kind: string,
  edition: string,
  n: number,
) => ({ book_key, book, source_id, source_name: `File ${source_id}`, kind, edition, n });

describe('listBooks', () => {
  it('makes one book of a book in two files, and one unnamed book per file', () => {
    const books = listBooks(
      {
        bookRows: () => [
          row(
            'example codex third party',
            'Example Codex (Third Party)',
            'A',
            'monster',
            '2014',
            30,
          ),
          row(
            'example codex third party',
            'Example Codex (Third Party)',
            'B',
            'monster',
            '2014',
            30,
          ),
          row('example codex third party', 'Example Codex (Third Party)', 'B', 'spell', '2024', 4),
          row('', '', 'A', 'item', '2014', 2),
          row('another book', 'Another Book', 'A', 'feat', 'unknown', 1),
        ],
      },
      { 'another book': { starred: true, off: false }, 'file:A': { starred: false, off: true } },
    );
    expect(books.map((b) => [b.key, b.records, b.files.length, b.starred, b.off])).toEqual([
      ['another book', 1, 1, true, false],
      ['example codex third party', 64, 2, false, false],
      ['file:A', 2, 1, false, true],
    ]);
    const codex = books[1]!;
    expect(codex).toMatchObject({
      name: 'Example Codex (Third Party)',
      tags: ['Third Party'],
      counts: { monster: 60, spell: 4 },
      editions: { '2024': 4, '2014': 60, unknown: 0 },
      files: [
        { id: 'A', name: 'File A', records: 30 },
        { id: 'B', name: 'File B', records: 34 },
      ],
    });
    expect(books[2]).toMatchObject({ unnamed: true, name: 'File A', tags: [] });
  });
});

describe('withBookSettings', () => {
  it('changes only what it is given, and keeps only what differs from the default', () => {
    const before = { a: { starred: true, off: false }, b: { starred: false, off: true } };
    expect(withBookSettings(before, ['a', 'c'], { off: true })).toEqual({
      a: { starred: true, off: true },
      b: { starred: false, off: true },
      c: { starred: false, off: true },
    });
    expect(withBookSettings(before, ['a', 'b'], { starred: false, off: false })).toEqual({});
  });
});

describe('with2024Books', () => {
  it('adds books, and takes out every entry that would still mark one', () => {
    expect(with2024Books(['Old Book'], ['New Book'], true)).toEqual(['Old Book', 'New Book']);
    // The importer compares by record key, so a differently written entry still matches.
    expect(with2024Books(['old book!', 'Kept'], ['Old Book'], false)).toEqual(['Kept']);
  });
});

describe('book SQL (ADR 0061)', () => {
  it('filters named books and a file’s unnamed records', () => {
    expect(bookFilter(undefined)).toBeNull();
    expect(bookFilter(['a book', 'file:F1'])).toEqual({
      sql: "(r.book_key IN (?) OR (r.book_key = '' AND r.source_id IN (?)))",
      params: ['a book', 'F1'],
    });
  });

  it('ranks homebrew, then starred books, then the source order, and leaves books that are off out', () => {
    expect(PRIORITY).toContain("WHEN s.kind = 'homebrew' THEN 0 WHEN r.starred = 1 THEN 1 ELSE 2");
    const search = buildSearch({ kind: 'monster', bookKeys: ['a book'] });
    expect(search.sql).toContain(`${PRIORITY} AS source_priority`);
    expect(search.sql).toContain('r.book_off = 0');
    expect(search.params).toContain('a book');
    expect(buildSearch({ kind: 'monster', includeDisabled: true }).sql).not.toContain(
      'r.book_off = 0',
    );
    expect(buildSuggest('gob').sql).toContain('r.book_off = 0');
    expect(buildTextSearch('fire bolt')!.sql).toContain('r.book_off = 0');
  });

  it('limits imported files to the open campaign’s books, and leaves the SRD and homebrew alone', () => {
    expect(campaignBooksFilter(null)).toBeNull();
    expect(campaignBooksFilter(['a book'])).toEqual({
      sql: "(s.kind NOT IN ('xml', 'open5e') OR (r.book_key IN (?)))",
      params: ['a book'],
    });
    // Collections with no books: no imported records at all.
    expect(campaignBooksFilter([])).toEqual({ sql: "s.kind NOT IN ('xml', 'open5e')", params: [] });
    const search = buildSearch({ kind: 'spell', campaignBookKeys: ['a book'] });
    expect(search.sql).toContain("s.kind NOT IN ('xml', 'open5e') OR");
    expect(search.countParams).toContain('a book');
    const suggest = buildSuggest('fire', 12, '2024', null, null, ['a book']);
    expect(suggest.sql).toContain("s.kind NOT IN ('xml', 'open5e') OR");
    // The book binds after the campaign's own parameters and before the limit.
    expect(suggest.params.slice(-2)).toEqual(['a book', 12]);
    expect(
      buildTextSearch('fire bolt', 12, '2024', null, null, ['a book'])!.params.slice(-2),
    ).toEqual(['a book', 12]);
  });
});
