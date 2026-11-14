import { describe, expect, it } from 'vitest';
import type { GridSpec } from '@trifold/schema';
import { cellAt, cellCentre, rulerLabel, squaresBetween } from './ruler';

/** The movement ruler (Beta 9): 5 ft a square, diagonals too. */
const grid: GridSpec = {
  cellPx: 50,
  offsetX: 10,
  offsetY: 20,
  color: '#000000',
  opacity: 0.3,
  showToPlayers: true,
};

describe('movement ruler', () => {
  it('counts a diagonal square like any other', () => {
    expect(squaresBetween({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(6);
    expect(squaresBetween({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(4);
    expect(squaresBetween({ x: 2, y: 5 }, { x: -1, y: 1 })).toBe(4);
    expect(squaresBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    // A token placed freely rounds to the nearest square.
    expect(squaresBetween({ x: 0, y: 0 }, { x: 2.25, y: 0.5 })).toBe(2);
  });

  it('reads in squares and feet', () => {
    expect(rulerLabel(6)).toBe('6 squares · 30 ft');
    expect(rulerLabel(1)).toBe('1 square · 5 ft');
    expect(rulerLabel(0)).toBe('0 squares · 0 ft');
  });

  it('finds the square under a point and the centre of a square or a token', () => {
    expect(cellAt({ x: 10, y: 20 }, grid)).toEqual({ x: 0, y: 0 });
    expect(cellAt({ x: 59, y: 69 }, grid)).toEqual({ x: 0, y: 0 });
    expect(cellAt({ x: 61, y: 19 }, grid)).toEqual({ x: 1, y: -1 });
    expect(cellCentre({ x: 1, y: 2 }, grid)).toEqual({ x: 85, y: 145 });
    // A Large token (2×2) at the same spot is centred on the corner its four squares share.
    expect(cellCentre({ x: 1, y: 2 }, grid, 2)).toEqual({ x: 110, y: 170 });
  });
});
