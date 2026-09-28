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

  it('leaves text without a citation untouched', () => {
    expect(extractSourceLine('No citation here.')).toEqual({ text: 'No citation here.' });
  });
});
