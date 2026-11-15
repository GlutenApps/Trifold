import { ulid } from 'ulid';
import type { FogShape, GridSpec } from '@trifold/schema';
import type { Point } from './mapMath';

/**
 * Fog of war, phase 1 (DESIGN.md §6.5, ADR 0029). The pure "is this point under fog" functions
 * live in `@trifold/rules` so the table server shares them (ADR 0043); this file adds the map
 * editor's drawing helpers.
 */
export {
  activeFog,
  addShape,
  covers,
  inPolygon,
  isRevealed,
  svgPoints,
  tokenCentre,
  tokensInView,
} from '@trifold/rules';

export type FogMode = FogShape['mode'];

/**
 * The rectangle a drag from `a` to `b` makes: on a grid, the whole cells the drag touches;
 * otherwise (or with Alt) exactly the drag.
 */
export function dragRect(
  a: Point,
  b: Point,
  grid: GridSpec | null,
): { x: number; y: number; w: number; h: number } {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  if (!grid) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const c = grid.cellPx;
  const sx = grid.offsetX + Math.floor((x0 - grid.offsetX) / c) * c;
  const sy = grid.offsetY + Math.floor((y0 - grid.offsetY) / c) * c;
  const ex =
    grid.offsetX +
    Math.max(Math.ceil((x1 - grid.offsetX) / c), Math.floor((x0 - grid.offsetX) / c) + 1) * c;
  const ey =
    grid.offsetY +
    Math.max(Math.ceil((y1 - grid.offsetY) / c), Math.floor((y0 - grid.offsetY) / c) + 1) * c;
  return { x: sx, y: sy, w: ex - sx, h: ey - sy };
}

export function rectShape(
  mode: FogMode,
  r: { x: number; y: number; w: number; h: number },
): FogShape {
  return { id: ulid(), mode, kind: 'rect', ...r };
}

export function polyShape(mode: FogMode, points: readonly Point[]): FogShape | null {
  if (points.length < 3) return null;
  return { id: ulid(), mode, kind: 'poly', points: points.flatMap((p) => [p.x, p.y]) };
}

export function allShape(mode: FogMode): FogShape {
  return { id: ulid(), mode, kind: 'all' };
}
