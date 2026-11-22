import { describe, expect, it } from 'vitest';
import {
  bookKey,
  booksInCollections,
  bookTags,
  campaignBooks,
  unnamedBookKey,
  unnamedBookSource,
} from './books';

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

describe('collections (ADR 0062)', () => {
  const collections = [
    { id: 'K1', name: 'Core', bookKeys: ['a', 'b'], campaignIds: ['C1', 'C2'] },
    { id: 'K2', name: 'Setting', bookKeys: ['b', 'c'], campaignIds: ['C1'] },
    { id: 'K3', name: 'Unused', bookKeys: ['d'], campaignIds: [] },
  ];

  it('gives a campaign the books of every collection it uses, or every book when it uses none', () => {
    expect(campaignBooks(collections, 'C1')).toEqual(['a', 'b', 'c']);
    expect(campaignBooks(collections, 'C2')).toEqual(['a', 'b']);
    expect(campaignBooks(collections, 'C3')).toBeNull();
    expect(campaignBooks(collections, null)).toBeNull();
    // A campaign that uses only an empty collection uses no imported books at all.
    expect(
      campaignBooks([{ ...collections[2]!, bookKeys: [], campaignIds: ['C4'] }], 'C4'),
    ).toEqual([]);
  });

  it('lists the books of some collections, ignoring ids that name none', () => {
    expect(booksInCollections(collections, ['K2', 'K3', 'gone'])).toEqual(['b', 'c', 'd']);
    expect(booksInCollections(collections, [])).toEqual([]);
  });
});
