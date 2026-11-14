import { ulid } from 'ulid';
import type { FogShape, GridSpec, SceneFog, Token } from '@trifold/schema';
import type { Point } from './mapMath';

/**
 * Fog of war, phase 1 (DESIGN.md §6.5, ADR 0029): a shape mask per scene. The fog starts whole
 * and its shapes apply in order, each revealing or hiding what it covers, so a point's state is
 * set by the last shape that covers it. Pure: the map editor draws with these, `liveSceneFrom`
 * filters tokens with them, and both screens render the same shapes as an SVG mask.
 */

export type FogMode = FogShape['mode'];

/** The fog the scene shows: null when it has none or it is off. */
export function activeFog(fog: SceneFog | undefined): SceneFog | null {
  return fog?.enabled ? fog : null;
}

/**
 * The shapes after adding one. Reveal all and Hide all cover everything before them, so those
 * go; hiding everything on a fresh fog is no shape at all.
 */
export function addShape(shapes: readonly FogShape[], shape: FogShape): FogShape[] {
  if (shape.kind === 'all') return shape.mode === 'hide' ? [] : [shape];
  return [...shapes, shape];
}

/** Ray casting over a flat `[x0, y0, x1, y1, …]` polygon. */
export function inPolygon(p: Point, points: readonly number[]): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2]!;
    const yi = points[i * 2 + 1]!;
    const xj = points[j * 2]!;
    const yj = points[j * 2 + 1]!;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function covers(shape: FogShape, p: Point): boolean {
  switch (shape.kind) {
    case 'all':
      return true;
    case 'rect':
      return (
        p.x >= shape.x && p.x <= shape.x + shape.w && p.y >= shape.y && p.y <= shape.y + shape.h
      );
    case 'poly':
      return inPolygon(p, shape.points);
  }
}

/** Whether the players can see a map point: the last shape covering it decides. */
export function isRevealed(fog: SceneFog | null, p: Point): boolean {
  if (!fog) return true;
  for (let i = fog.shapes.length - 1; i >= 0; i--) {
    const shape = fog.shapes[i]!;
    if (covers(shape, p)) return shape.mode === 'reveal';
  }
  return false;
}

/** A token's centre in map pixels. */
export function tokenCentre(token: Pick<Token, 'x' | 'y' | 'footprint'>, grid: GridSpec): Point {
  return {
    x: grid.offsetX + (token.x + token.footprint / 2) * grid.cellPx,
    y: grid.offsetY + (token.y + token.footprint / 2) * grid.cellPx,
  };
}

/** Tokens the players may see: those whose centre is not under fog. */
export function tokensInView<T extends Pick<Token, 'x' | 'y' | 'footprint'>>(
  tokens: readonly T[],
  fog: SceneFog | null,
  grid: GridSpec,
): T[] {
  if (!fog) return [...tokens];
  return tokens.filter((t) => isRevealed(fog, tokenCentre(t, grid)));
}

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

/** An SVG polygon's `points` attribute. */
export const svgPoints = (points: readonly number[]): string =>
  points.reduce((s, v, i) => s + (i % 2 ? `,${v}` : `${i ? ' ' : ''}${v}`), '');
