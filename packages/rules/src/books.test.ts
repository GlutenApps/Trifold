import { describe, expect, it } from 'vitest';
import { bookKey, bookTags, unnamedBookKey, unnamedBookSource } from './books';

describe('bookKey', () => {
  it('is the same for one book however the file writes it', () => {
    expect(bookKey('Tales of Example: Book Two')).toBe('tales of example book two');
    expect(bookKey('  TALES of Example —  Book   Two ')).toBe('tales of example book two');
    expect(bookKey('Ex’s Guide to Everything')).toBe(bookKey("Ex's Guide to Everything"));
    expect(bookKey('Codex Ëxample')).toBe('codex example');
  });

  it('keeps a printing year and a tag apart, unlike a record key', () => {
    expect(bookKey('Example Manual (2014)')).not.toBe(bookKey('Example Manual (2025)'));
    expect(bookKey('Example Codex (Third Party)')).toBe('example codex third party');
  });
});

describe('bookTags', () => {
  it('reads tags in brackets, but not a printing year', () => {
    expect(bookTags('Example Codex (Third Party)')).toEqual(['Third Party']);
    expect(bookTags('Example Manual (2025)')).toEqual([]);
    expect(bookTags('Notes (Homebrew) (UA)')).toEqual(['Homebrew', 'UA']);
    expect(bookTags('Plain Book')).toEqual([]);
  });
});

describe('unnamed books', () => {
  it('stand for one file’s records that name no book', () => {
    expect(unnamedBookKey('01ABC')).toBe('file:01ABC');
    expect(unnamedBookSource('file:01ABC')).toBe('01ABC');
    expect(unnamedBookSource('example manual')).toBeNull();
  });
});
