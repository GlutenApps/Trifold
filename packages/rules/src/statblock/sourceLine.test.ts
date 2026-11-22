import { describe, expect, it } from 'vitest';
import { extractSourceLine } from './sourceLine';

describe('extractSourceLine', () => {
  it('parses "Book p. N" and removes the line', () => {
    const text = 'Lore paragraph one.\n\nLore paragraph two.\n\nSource: Example Manual p. 12';
    expect(extractSourceLine(text)).toEqual({
      text: 'Lore paragraph one.\n\nLore paragraph two.',
      sourceBook: 'Example Manual',
      sourcePage: 12,
    });
  });

  it('parses "Book, p. N" and "pg" forms', () => {
    expect(extractSourceLine('Source: Example Manual (2025), p. 301')).toMatchObject({
      sourceBook: 'Example Manual (2025)',
      sourcePage: 301,
    });
    expect(extractSourceLine('Source: Example Codex pg 44')).toMatchObject({
      sourceBook: 'Example Codex',
      sourcePage: 44,
    });
  });

  it('handles a missing page and a citation in the middle of the text', () => {
    expect(extractSourceLine('Source: Homebrew Notes')).toEqual({
      text: '',
      sourceBook: 'Homebrew Notes',
    });
    expect(extractSourceLine('Before.\nSource: Example Manual p. 7\nAfter.')).toEqual({
      text: 'Before.\n\nAfter.',
      sourceBook: 'Example Manual',
      sourcePage: 7,
    });
  });

  it('keeps a tag after the page with the book, and takes the first of several books', () => {
    // Observed: a tag in brackets after the page belongs to the book.
    expect(extractSourceLine('Source: Example Codex p. 320 (Third Party)')).toMatchObject({
      text: '',
      sourceBook: 'Example Codex (Third Party)',
      sourcePage: 320,
    });
    // Observed: a line naming several books ends the first with a comma.
    expect(extractSourceLine('Source: Example Manual p. 150,\nOther text.')).toEqual({
      text: 'Other text.',
      sourceBook: 'Example Manual',
      sourcePage: 150,
    });
    expect(extractSourceLine('Source: Example Manual p. 12, Example Codex p. 40')).toMatchObject({
      sourceBook: 'Example Manual',
      sourcePage: 12,
    });
    // Every page of a book is the same book.
    const books = ['p. 1 (Homebrew)', 'p. 99 (Homebrew)', 'page 7 (Homebrew),'].map(
      (tail) => extractSourceLine(`Source: Tales of Example: Book Two ${tail}`).sourceBook,
    );
    expect(new Set(books)).toEqual(new Set(['Tales of Example: Book Two (Homebrew)']));
  });

  it('does not take a page out of a book’s own name', () => {
    expect(extractSourceLine('Source: Swamp 3')).toMatchObject({ sourceBook: 'Swamp 3' });
    expect(extractSourceLine('Source: Example Tome 2 p. 18')).toMatchObject({
      sourceBook: 'Example Tome 2',
      sourcePage: 18,
    });
  });

  it('leaves text without a citation untouched', () => {
    expect(extractSourceLine('No citation here.')).toEqual({ text: 'No citation here.' });
  });
});
