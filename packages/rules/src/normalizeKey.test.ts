import { describe, expect, it } from 'vitest';
import { normalizeKey } from './normalizeKey';

describe('normalizeKey', () => {
  it('strips the 2024 edition tag so both editions share a key', () => {
    expect(normalizeKey('Aboleth [5.5e]')).toBe('aboleth');
    expect(normalizeKey('Aboleth')).toBe('aboleth');
  });

  it('strips parenthesised tags', () => {
    expect(normalizeKey('Fighter (Legacy)')).toBe('fighter');
    expect(normalizeKey('Way of Shadow (UA)')).toBe('way of shadow');
  });

  it('replaces punctuation with spaces and collapses whitespace', () => {
    expect(normalizeKey("Will-o'-Wisp")).toBe('will o wisp');
    expect(normalizeKey('  Giant   Spider ')).toBe('giant spider');
    expect(normalizeKey('Dragon, Ghost')).toBe('dragon ghost');
  });

  it('folds accents', () => {
    expect(normalizeKey('Bâton Élan')).toBe('baton elan');
  });

  it('keeps digits', () => {
    expect(normalizeKey('Spell Scroll (Level 3)')).toBe('spell scroll');
    expect(normalizeKey('Potion of Healing 2')).toBe('potion of healing 2');
  });
});
