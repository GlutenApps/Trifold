import { describe, expect, it } from 'vitest';
import type { FogShape, GridSpec, SceneFog } from '@trifold/schema';
import {
  activeFog,
  addShape,
  allShape,
  dragRect,
  inPolygon,
  isRevealed,
  polyShape,
  rectShape,
  svgPoints,
  tokenCentre,
  tokensInView,
} from './fog';

/** Fog of war, phase 1 (ADR 0029): shapes applied in order over a whole fog. */
const grid: GridSpec = {
  cellPx: 50,
  offsetX: 10,
  offsetY: 0,
  color: '#000000',
  opacity: 0.3,
  showToPlayers: true,
};
const fog = (shapes: FogShape[]): SceneFog => ({ enabled: true, shapes });

describe('fog of war', () => {
  it('is whole until something is revealed, and off shows everything', () => {
    expect(isRevealed(fog([]), { x: 5, y: 5 })).toBe(false);
    expect(isRevealed(null, { x: 5, y: 5 })).toBe(true);
    expect(activeFog({ enabled: false, shapes: [] })).toBeNull();
    expect(activeFog(undefined)).toBeNull();
  });

  it('lets the last shape covering a point decide', () => {
    const room = rectShape('reveal', { x: 0, y: 0, w: 100, h: 100 });
    const pillar = rectShape('hide', { x: 40, y: 40, w: 20, h: 20 });
    const f = fog([room, pillar]);
    expect(isRevealed(f, { x: 10, y: 10 })).toBe(true);
    expect(isRevealed(f, { x: 50, y: 50 })).toBe(false);
    expect(isRevealed(f, { x: 150, y: 50 })).toBe(false);
    // Revealing the pillar again, later, wins.
    const again = fog([room, pillar, rectShape('reveal', { x: 45, y: 45, w: 10, h: 10 })]);
    expect(isRevealed(again, { x: 50, y: 50 })).toBe(true);
  });

  it('reveals inside a polygon and not outside it', () => {
    const tri = polyShape('reveal', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ])!;
    expect(isRevealed(fog([tri]), { x: 20, y: 20 })).toBe(true);
    expect(isRevealed(fog([tri]), { x: 80, y: 80 })).toBe(false);
    expect(inPolygon({ x: 1, y: 1 }, [0, 0, 10, 0, 10, 10, 0, 10])).toBe(true);
    expect(
      polyShape('reveal', [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
    expect(svgPoints([0, 0, 10, 0, 0, 10])).toBe('0,0 10,0 0,10');
  });

  it('drops what Reveal all and Hide all cover', () => {
    const a = rectShape('reveal', { x: 0, y: 0, w: 10, h: 10 });
    const all = allShape('reveal');
    expect(addShape([a], all)).toEqual([all]);
    expect(addShape([a, all], allShape('hide'))).toEqual([]);
    expect(addShape([all], a)).toEqual([all, a]);
    expect(isRevealed(fog([all]), { x: 9999, y: 9999 })).toBe(true);
  });

  it('snaps a drag to whole cells on a grid, and leaves it free without one', () => {
    // Cells start at x = 10 (the offset): a drag inside one cell covers that cell.
    expect(dragRect({ x: 20, y: 5 }, { x: 30, y: 6 }, grid)).toEqual({ x: 10, y: 0, w: 50, h: 50 });
    // Dragged backwards across two cells each way.
    expect(dragRect({ x: 105, y: 99 }, { x: 15, y: 1 }, grid)).toEqual({
      x: 10,
      y: 0,
      w: 100,
      h: 100,
    });
    expect(dragRect({ x: 30, y: 40 }, { x: 10, y: 5 }, null)).toEqual({
      x: 10,
      y: 5,
      w: 20,
      h: 35,
    });
  });

  it('keeps tokens under fog from the players by their centre', () => {
    const tokens = [
      { id: 'seen', x: 0, y: 0, footprint: 1 as const },
      { id: 'fogged', x: 4, y: 0, footprint: 1 as const },
      { id: 'big', x: 1, y: 0, footprint: 2 as const },
    ];
    expect(tokenCentre(tokens[2]!, grid)).toEqual({ x: 110, y: 50 });
    const f = fog([rectShape('reveal', { x: 10, y: 0, w: 150, h: 100 })]);
    expect(tokensInView(tokens, f, grid).map((t) => t.id)).toEqual(['seen', 'big']);
    expect(tokensInView(tokens, null, grid)).toHaveLength(3);
  });
});
