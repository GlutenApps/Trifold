/**
 * Fog of war, phase 1 (DESIGN.md §6.5, ADR 0029): a shape mask per scene. The fog starts whole
 * and its shapes apply in order, each revealing or hiding what it covers, so a point's state is
 * set by the last shape that covers it. The one "is this point under fog" test (ADR 0043): the
 * console's map editor, the TV's live scene and the table server all filter with these.
 * Structural types, so the schema's `FogShape`, `SceneFog` and `GridSpec` fit without an import.
 */

export interface FogPoint {
  x: number;
  y: number;
}

export type FogShapeLike =
  | { mode: 'reveal' | 'hide'; kind: 'all' }
  | { mode: 'reveal' | 'hide'; kind: 'rect'; x: number; y: number; w: number; h: number }
  | { mode: 'reveal' | 'hide'; kind: 'poly'; points: readonly number[] };

export interface FogLike<S extends FogShapeLike = FogShapeLike> {
  enabled: boolean;
  shapes: readonly S[];
}

export interface GridLike {
  cellPx: number;
  offsetX: number;
  offsetY: number;
}

export interface TokenPlace {
  x: number;
  y: number;
  footprint: number;
}

/** The fog the scene shows: null when it has none or it is off. */
export function activeFog<F extends FogLike>(fog: F | undefined | null): F | null {
  return fog?.enabled ? fog : null;
}

/**
 * The shapes after adding one. Reveal all and Hide all cover everything before them, so those
 * go; hiding everything on a fresh fog is no shape at all.
 */
export function addShape<S extends FogShapeLike>(shapes: readonly S[], shape: S): S[] {
  if (shape.kind === 'all') return shape.mode === 'hide' ? [] : [shape];
  return [...shapes, shape];
}

/** Ray casting over a flat `[x0, y0, x1, y1, …]` polygon. */
export function inPolygon(p: FogPoint, points: readonly number[]): boolean {
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

export function covers(shape: FogShapeLike, p: FogPoint): boolean {
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
export function isRevealed(fog: FogLike | null, p: FogPoint): boolean {
  if (!fog) return true;
  for (let i = fog.shapes.length - 1; i >= 0; i--) {
    const shape = fog.shapes[i]!;
    if (covers(shape, p)) return shape.mode === 'reveal';
  }
  return false;
}

/** A token's centre in map pixels. */
export function tokenCentre(token: TokenPlace, grid: GridLike): FogPoint {
  return {
    x: grid.offsetX + (token.x + token.footprint / 2) * grid.cellPx,
    y: grid.offsetY + (token.y + token.footprint / 2) * grid.cellPx,
  };
}

/** Tokens the players may see: those whose centre is not under fog. */
export function tokensInView<T extends TokenPlace>(
  tokens: readonly T[],
  fog: FogLike | null,
  grid: GridLike,
): T[] {
  if (!fog) return [...tokens];
  return tokens.filter((t) => isRevealed(fog, tokenCentre(t, grid)));
}

/** An SVG polygon's `points` attribute. */
export const svgPoints = (points: readonly number[]): string =>
  points.reduce((s, v, i) => s + (i % 2 ? `,${v}` : `${i ? ' ' : ''}${v}`), '');

/**
 * A short, stable key for a fog state, so a fogged map image can be cached per change. FNV-1a
 * over the shapes' JSON; null fog is "open".
 */
export function fogKey(fog: FogLike | null): string {
  if (!fog) return 'open';
  const text = JSON.stringify(fog.shapes);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
