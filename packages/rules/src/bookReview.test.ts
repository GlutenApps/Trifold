import { describe, expect, it } from 'vitest';
import { reviewBooks } from './bookReview';
import { isMarked2024 } from './statblock/edition';

const r = (kind: string, key: string, edition: string, sourceBook?: string) => ({
  kind,
  key,
  edition,
  sourceBook,
});

describe('reviewBooks', () => {
  it('lists books with counts and counts names that clash across books in one edition', () => {
    const review = reviewBooks([
      r('monster', 'bog hag', '2014', 'Gloomwood Bestiary'),
      r('monster', 'bog hag', '2014', 'Gloomwood Bestiary, Revised'),
      r('monster', 'mire imp', '2014', 'Gloomwood Bestiary'),
      // Two copies from one book: not something marking a book can fix.
      r('spell', 'murk', '2014', 'Gloomwood Bestiary'),
      r('spell', 'murk', '2014', 'Gloomwood Bestiary'),
      // Already apart by edition.
      r('spell', 'glow', '2014', 'Gloomwood Bestiary'),
      r('spell', 'glow', '2024', 'Gloomwood Bestiary, Revised'),
      r('item', 'lamp', '2014'),
    ]);
    expect(review.books).toEqual([
      { name: 'Gloomwood Bestiary', records: 5 },
      { name: 'Gloomwood Bestiary, Revised', records: 2 },
    ]);
    expect(review.duplicates).toEqual({ monster: 1 });
  });

  it('matches a marked book loosely, as the importer does', () => {
    expect(isMarked2024('Gloomwood Bestiary, Revised', ['gloomwood bestiary revised'])).toBe(true);
    expect(isMarked2024('Gloomwood Bestiary', ['Gloomwood Bestiary, Revised'])).toBe(false);
  });

  it('marks one printing of a book, not the other', () => {
    // As the Books tab writes an entry: the exact name, brackets and all.
    expect(isMarked2024('Gloomwood Bestiary (2025)', ['Gloomwood Bestiary (2025)'])).toBe(true);
    expect(isMarked2024('Gloomwood Bestiary (2014)', ['Gloomwood Bestiary (2025)'])).toBe(false);
    // As a DM may type one: no brackets, so any printing but one from before 2024.
    expect(isMarked2024('Gloomwood Bestiary (2025)', ['gloomwood bestiary'])).toBe(true);
    expect(isMarked2024('Gloomwood Bestiary (2014)', ['gloomwood bestiary'])).toBe(false);
    expect(isMarked2024('Gloomwood Bestiary (Third Party)', ['gloomwood bestiary'])).toBe(true);
  });

  it('keeps two printings apart as books', () => {
    const review = reviewBooks([
      r('monster', 'wolf', '2014', 'Gloomwood Bestiary (2014)'),
      r('monster', 'wolf', '2014', 'Gloomwood Bestiary (2025)'),
    ]);
    expect(review.books.map((b) => b.name)).toEqual([
      'Gloomwood Bestiary (2014)',
      'Gloomwood Bestiary (2025)',
    ]);
    expect(review.duplicates).toEqual({ monster: 1 });
  });
});
