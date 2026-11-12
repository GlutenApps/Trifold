import { describe, expect, it } from 'vitest';
import { isMarked2024, reviewBooks } from './bookReview';

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
});
