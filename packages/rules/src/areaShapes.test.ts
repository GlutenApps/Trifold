import { describe, expect, it } from 'vitest';
import { areaLabel, areaOutline, areaSquares, snapToCorner, type AreaShape } from './areaShapes';

/** Area shapes (ADR 0050): squares count when at least half of them is inside. */
const grid = { cellPx: 50, offsetX: 0, offsetY: 0 };
const map = { width: 1000, height: 1000 };
const key = (cells: Array<{ x: number; y: number }>) =>
  cells
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join(' ');

describe('area shapes', () => {
  it('covers a 10-ft cube as 2 × 2 squares from the middle of its face', () => {
    // The origin is the middle of the near face (100, 100), aimed right: the cube spans x 100–200
    // and y 50–150, covering half of rows 1 and 2 each, which counts: 2 × 2 squares.
    const cube: AreaShape = {
      kind: 'cube',
      origin: { x: 100, y: 100 },
      aim: { x: 300, y: 100 },
      sizeFt: 10,
    };
    expect(key(areaSquares(cube, grid, map))).toBe(
      key([
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ]),
    );
  });

  it("keeps a cube's and a line's origin in the middle of the starting face, not on a corner", () => {
    for (const kind of ['cube', 'line'] as const) {
      const outline = areaOutline(
        { kind, origin: { x: 100, y: 100 }, aim: { x: 100, y: 400 }, sizeFt: 10 },
        grid,
      );
      expect(outline.kind === 'polygon' && outline.origin).toEqual({ x: 100, y: 100 });
      // The corners of the starting face sit either side of it.
      expect(outline.kind === 'polygon' && outline.points[0]).not.toEqual({ x: 100, y: 100 });
    }
  });

  it('draws a sphere started on a creature as an Emanation from the edge of its space', () => {
    // A Medium creature in cell (4, 4): centre (225, 225), half a square wide. A 10-ft emanation
    // reaches two squares past its space, so it covers the 5 × 5 block around it, corners aside.
    const from = { x: 225, y: 225, half: 25 };
    const shape: AreaShape = { kind: 'sphere', origin: from, aim: from, sizeFt: 10, from };
    expect(areaOutline(shape, grid)).toEqual({ kind: 'circle', cx: 225, cy: 225, r: 125 });
    const cells = areaSquares(shape, grid, map);
    expect(cells).toContainEqual({ x: 4, y: 4 });
    expect(cells).toContainEqual({ x: 2, y: 4 });
    expect(cells).toContainEqual({ x: 6, y: 4 });
    expect(cells).not.toContainEqual({ x: 7, y: 4 });
    expect(areaLabel('sphere', 10, true)).toBe('10-ft emanation');
    expect(areaLabel('sphere', 10)).toBe('10-ft sphere');
  });

  it('starts a cone from a creature at the edge of its space, facing the aim', () => {
    const from = { x: 225, y: 225, half: 25 };
    const right = areaOutline(
      { kind: 'cone', origin: from, aim: { x: 500, y: 225 }, sizeFt: 15, from },
      grid,
    );
    expect(right.kind === 'polygon' && right.origin).toEqual({ x: 250, y: 225 });
    // Aimed at a diagonal, it leaves from the space's corner.
    const corner = areaOutline(
      { kind: 'cone', origin: from, aim: { x: 500, y: 500 }, sizeFt: 15, from },
      grid,
    );
    expect(corner.kind === 'polygon' && corner.origin).toEqual({ x: 250, y: 250 });
  });

  it('covers a 5-ft line one square wide along its length', () => {
    // Along the middle of row 2, a 30-ft line to the right covers 6 squares.
    const line: AreaShape = {
      kind: 'line',
      origin: { x: 100, y: 125 },
      aim: { x: 500, y: 125 },
      sizeFt: 30,
    };
    expect(areaSquares(line, grid, map).map((c) => `${c.x},${c.y}`)).toEqual([
      '2,2',
      '3,2',
      '4,2',
      '5,2',
      '6,2',
      '7,2',
    ]);
  });

  it('makes a cone as wide as it is long, widening from its origin', () => {
    const cone: AreaShape = {
      kind: 'cone',
      origin: { x: 100, y: 200 },
      aim: { x: 400, y: 200 },
      sizeFt: 15,
    };
    const outline = areaOutline(cone, grid);
    expect(outline).toEqual({
      kind: 'polygon',
      points: [
        { x: 100, y: 200 },
        { x: 250, y: 275 },
        { x: 250, y: 125 },
      ],
      origin: { x: 100, y: 200 },
    });
    const cells = areaSquares(cone, grid, map);
    // A 15-ft cone right from a corner: 1 square, then 2, then 2 (the 2024 rules' template).
    expect(cells.filter((c) => c.x === 2)).toHaveLength(0);
    expect(cells.filter((c) => c.x === 3).length).toBeGreaterThanOrEqual(1);
    expect(cells.filter((c) => c.x === 4).length).toBe(2);
    expect(cells.every((c) => c.x >= 2 && c.x <= 4)).toBe(true);
  });

  it('covers a 10-ft-radius sphere around a corner as a 4 × 4 block less its corners', () => {
    const sphere: AreaShape = {
      kind: 'sphere',
      origin: { x: 200, y: 200 },
      aim: { x: 200, y: 200 },
      sizeFt: 10,
    };
    const cells = areaSquares(sphere, grid, map);
    expect(cells).toHaveLength(12);
    expect(cells.some((c) => c.x === 2 && c.y === 2)).toBe(false);
  });

  it('leaves out squares off the map, and snaps the origin to the nearest corner', () => {
    const edge: AreaShape = {
      kind: 'sphere',
      origin: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      sizeFt: 10,
    };
    expect(areaSquares(edge, grid, map).every((c) => c.x >= 0 && c.y >= 0)).toBe(true);
    expect(snapToCorner({ x: 74, y: 26 }, grid)).toEqual({ x: 50, y: 50 });
  });
});
