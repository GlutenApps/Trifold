import { describe, expect, it } from 'vitest';
import { displayTags, kindFromTags, normalizeTag, withTags, withoutTag } from './tags';

describe('track tags', () => {
  it('derives the kind from the first kind word, music by default', () => {
    expect(kindFromTags(['tavern', 'ambiance'])).toBe('ambience');
    expect(kindFromTags(['sfx'])).toBe('sfx');
    expect(kindFromTags(['combat', 'boss'])).toBe('music');
    expect(kindFromTags([])).toBe('music');
  });

  it('shows an older kind as a tag until a kind word is present', () => {
    expect(displayTags({ kind: 'ambience', tags: ['eerie'] })).toEqual(['ambience', 'eerie']);
    expect(displayTags({ kind: 'sfx', tags: ['effect'] })).toEqual(['effect']);
    expect(displayTags({ kind: 'music', tags: ['combat'] })).toEqual(['combat']);
  });

  it('adds normalized tags once and removes them, updating the kind', () => {
    expect(normalizeTag('  Dark   Forest ')).toBe('dark forest');
    expect(withTags(['combat'], ['Combat', ' Ambience ', ''])).toEqual({
      tags: ['combat', 'ambience'],
      kind: 'ambience',
    });
    expect(withoutTag(['combat', 'ambience'], 'ambience')).toEqual({
      tags: ['combat'],
      kind: 'music',
    });
  });
});
