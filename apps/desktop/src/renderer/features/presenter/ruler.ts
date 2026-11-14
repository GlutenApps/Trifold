import type { GridSpec } from '@trifold/schema';
import type { Point } from './mapMath';

/**
 * The movement ruler (DESIGN.md §6.5, Beta 9): distances in squares and feet on a square grid.
 * Every square is 5 ft, diagonals too (the default rule in the 2014 and 2024 books), so a
 * distance is the larger of the two axis counts. Pure; the map editor draws with it and the TV
 * shows the same line.
 */

export const FEET_PER_SQUARE = 5;

/** The cell a map-pixel point falls in, in grid units. */
export function cellAt(p: Point, grid: GridSpec): Point {
  return {
    x: Math.floor((p.x - grid.offsetX) / grid.cellPx),
    y: Math.floor((p.y - grid.offsetY) / grid.cellPx),
  };
}

/** The centre of a cell, or of a token's footprint at grid position `cell`, in map pixels. */
export function cellCentre(cell: Point, grid: GridSpec, footprint = 1): Point {
  return {
    x: grid.offsetX + (cell.x + footprint / 2) * grid.cellPx,
    y: grid.offsetY + (cell.y + footprint / 2) * grid.cellPx,
  };
}

/**
 * Squares between two grid positions, diagonals counting 5 ft like any other square. Positions
 * placed freely (Alt) are rounded to the nearest square.
 */
export function squaresBetween(a: Point, b: Point): number {
  return Math.max(Math.round(Math.abs(b.x - a.x)), Math.round(Math.abs(b.y - a.y)));
}

/** "6 squares · 30 ft", the reading both screens show. */
export function rulerLabel(squares: number): string {
  return `${squares} ${squares === 1 ? 'square' : 'squares'} · ${squares * FEET_PER_SQUARE} ft`;
}
