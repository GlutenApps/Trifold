import { describe, expect, it } from 'vitest';
import { formatZoom, stepZoom } from './webZoom';

describe('stepZoom', () => {
  it('walks the browser steps in both directions', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(0.9, -1)).toBe(0.8);
  });

  it('snaps an off-list value to the next step and stops at the ends', () => {
    expect(stepZoom(1.3, 1)).toBe(1.5);
    expect(stepZoom(1.3, -1)).toBe(1.25);
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });
});

describe('formatZoom', () => {
  it('prints a percentage', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(0.67)).toBe('67%');
  });
});
