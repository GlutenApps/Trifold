import { describe, expect, it } from 'vitest';
import { freeCellsNear, summonExpired, summonLabels, summonProblem } from './summons';
import type { SummonRequest } from './types';

const grid = { cellPx: 10, offsetX: 0, offsetY: 0 };
const owner = { x: 5, y: 5, footprint: 1 };
const map = { cols: 20, rows: 20 };

describe('freeCellsNear', () => {
  it('puts summons in the ring around the owner, on free cells', () => {
    const cells = freeCellsNear(owner, 1, 3, [owner], map, null, grid);
    expect(cells).toHaveLength(3);
    for (const c of cells) {
      expect(Math.max(Math.abs(c.x - 5), Math.abs(c.y - 5))).toBe(1);
    }
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(3);
  });

  it('skips taken cells and goes a ring further when the first is full', () => {
    const ring1 = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) ring1.push({ x: 5 + dx, y: 5 + dy, footprint: 1 });
    const cells = freeCellsNear(owner, 1, 1, ring1, map, null, grid);
    expect(Math.max(Math.abs(cells[0]!.x - 5), Math.abs(cells[0]!.y - 5))).toBe(2);
  });

  it('never lands under fog or off the map', () => {
    // Only columns 0–5 are revealed.
    const fog = {
      enabled: true,
      shapes: [{ mode: 'reveal' as const, kind: 'rect' as const, x: 0, y: 0, w: 60, h: 200 }],
    };
    const cells = freeCellsNear(owner, 1, 8, [owner], map, fog, grid);
    expect(cells.every((c) => c.x <= 5)).toBe(true);
    const corner = freeCellsNear({ x: 0, y: 0, footprint: 1 }, 1, 3, [], map, null, grid);
    expect(corner.every((c) => c.x >= 0 && c.y >= 0)).toBe(true);
  });

  it('gives fewer when there is no room', () => {
    expect(
      freeCellsNear(owner, 1, 5, [owner], { cols: 7, rows: 6 }, null, grid).length,
    ).toBeLessThanOrEqual(5);
    expect(
      freeCellsNear(
        { x: 0, y: 0, footprint: 1 },
        1,
        2,
        [{ x: 0, y: 0, footprint: 1 }],
        { cols: 1, rows: 1 },
        null,
        grid,
      ),
    ).toEqual([]);
  });
});

describe('summonLabels', () => {
  it('names one summon plainly and numbers several', () => {
    expect(summonLabels('Owl', 1, [])).toEqual(['Owl']);
    expect(summonLabels('Skeleton', 3, [])).toEqual(['Skeleton 1', 'Skeleton 2', 'Skeleton 3']);
  });
  it('carries on after the ones in play', () => {
    expect(summonLabels('Skeleton', 2, ['Skeleton 1', 'Skeleton 3'])).toEqual([
      'Skeleton 4',
      'Skeleton 5',
    ]);
    expect(summonLabels('Owl', 1, ['Owl'])).toEqual(['Owl 2']);
    expect(summonLabels('Owl', 1, ['Owlbear'])).toEqual(['Owl']);
  });
});

describe('summonProblem', () => {
  const request: SummonRequest = {
    ownerKind: 'pc',
    ownerId: 'b',
    optionKey: 'owl',
    count: 1,
    initiative: 'shared',
    concentration: false,
    persistent: false,
  };
  const ok = {
    mode: 'on' as const,
    request,
    ownerHeld: true,
    optionExists: true,
    hasMap: true,
    inPlay: 0,
    cap: 8,
  };

  it('allows a summon within the rules', () => {
    expect(summonProblem(ok)).toBeNull();
  });
  it('refuses when off, not held, not listed or without a map', () => {
    expect(summonProblem({ ...ok, mode: 'off' })).toMatch(/off/);
    expect(summonProblem({ ...ok, ownerHeld: false })).toMatch(/yours/);
    expect(summonProblem({ ...ok, optionExists: false })).toMatch(/list/);
    expect(summonProblem({ ...ok, hasMap: false })).toMatch(/map/);
  });
  it('holds counts, rounds and the cap', () => {
    expect(summonProblem({ ...ok, request: { ...request, count: 9 } })).toMatch(/1 to 8/);
    expect(summonProblem({ ...ok, request: { ...request, rounds: 0 } })).toMatch(/rounds/);
    expect(summonProblem({ ...ok, inPlay: 7, request: { ...request, count: 2 } })).toMatch(
      /more than 8/,
    );
  });
});

describe('summonExpired', () => {
  it('runs out at its round, never without one', () => {
    expect(summonExpired(3, 2)).toBe(false);
    expect(summonExpired(3, 3)).toBe(true);
    expect(summonExpired(undefined, 99)).toBe(false);
  });
});
