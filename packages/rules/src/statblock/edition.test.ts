import { describe, expect, it } from 'vitest';
import { normalizeKey } from '../normalizeKey';
import { parseNameTags, resolveEdition } from './edition';

describe('parseNameTags', () => {
  it('strips the 2024 suffix', () => {
    expect(parseNameTags('Aboleth [5.5e]')).toEqual({
      displayName: 'Aboleth',
      is2024: true,
      tags: [],
    });
    expect(parseNameTags('Aboleth')).toEqual({ displayName: 'Aboleth', is2024: false, tags: [] });
  });

  it('collects legacy, UA and third-party tags', () => {
    expect(parseNameTags('Way of the Four Elements (Legacy)')).toEqual({
      displayName: 'Way of the Four Elements',
      is2024: false,
      tags: ['legacy'],
    });
    expect(parseNameTags('Something (UA) [5.5e]').tags).toEqual(['unearthed-arcana']);
    expect(parseNameTags('Something (TP)').tags).toEqual(['third-party']);
  });

  it('collapses both editions of a creature onto one key', () => {
    expect(normalizeKey(parseNameTags('Aboleth [5.5e]').displayName)).toBe(
      normalizeKey(parseNameTags('Aboleth').displayName),
    );
  });
});

describe('resolveEdition', () => {
  const books = ['Example Manual (2025)', "Player's Guide (2024)"];

  it('prefers the name suffix', () => {
    expect(
      resolveEdition({
        is2024: true,
        sourceBook: 'Old Book',
        edition2024Books: books,
        defaultEdition: '2014',
      }),
    ).toBe('2024');
  });

  it('falls back to the 2024 book list, matched loosely', () => {
    expect(
      resolveEdition({
        is2024: false,
        sourceBook: 'example manual (2025)',
        edition2024Books: books,
        defaultEdition: '2014',
      }),
    ).toBe('2024');
  });

  it('otherwise uses the source default', () => {
    expect(
      resolveEdition({
        is2024: false,
        sourceBook: 'Old Book',
        edition2024Books: books,
        defaultEdition: '2014',
      }),
    ).toBe('2014');
    expect(resolveEdition({ is2024: false, edition2024Books: [], defaultEdition: 'unknown' })).toBe(
      'unknown',
    );
  });
});
