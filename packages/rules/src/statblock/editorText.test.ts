import { describe, expect, it } from 'vitest';
import { formatModifierPairs, parseModifierPairs } from './editorText';

describe('parseModifierPairs', () => {
  it('reads signed and unsigned numbers and lower-cases the key', () => {
    expect(parseModifierPairs('Dex +5, con 3, Wis -2')).toEqual({ dex: 5, con: 3, wis: -2 });
  });

  it('skips parts without a number and keeps multi-word skills', () => {
    expect(parseModifierPairs('stealth +7, bogus, animal handling 2')).toEqual({
      stealth: 7,
      'animal handling': 2,
    });
  });
});

describe('formatModifierPairs', () => {
  it('writes a sign on every value and round-trips', () => {
    const text = formatModifierPairs({ dex: 5, con: -1, str: 0 });
    expect(text).toBe('dex +5, con -1, str +0');
    expect(parseModifierPairs(text)).toEqual({ dex: 5, con: -1, str: 0 });
  });
});
