import { describe, expect, it } from 'vitest';
import { layoutFor, persistentTools } from './useLayout';

describe('layoutFor (player UI handoff)', () => {
  it('picks the layout from the viewport, not the device', () => {
    expect(layoutFor(390, 844)).toBe('phonePortrait');
    expect(layoutFor(844, 390)).toBe('phoneLandscape');
    expect(layoutFor(820, 1180)).toBe('tabletPortrait');
    expect(layoutFor(1180, 820)).toBe('wide');
    expect(layoutFor(1440, 900)).toBe('wide');
    // A narrow desktop window is laid out like a phone.
    expect(layoutFor(560, 900)).toBe('phonePortrait');
  });

  it('keeps a tool open on tablets and laptops only', () => {
    expect(persistentTools('wide')).toBe(true);
    expect(persistentTools('tabletPortrait')).toBe(true);
    expect(persistentTools('phonePortrait')).toBe(false);
    expect(persistentTools('phoneLandscape')).toBe(false);
  });
});
