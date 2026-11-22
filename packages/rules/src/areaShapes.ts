/**
 * Area-of-effect shapes on a map (ADR 0050): the 2024 rules' cone, sphere, cube and line, drawn
 * by the DM to see what an effect would cover. They select nothing; they show the shape and the
 * squares it covers, a square counting when at least half of it is inside (the 2024 rules' grid
 * variant). Everything here is in map pixels, with 5 feet to a square.
 */

export type AreaKind = 'cone' | 'sphere' | 'cube' | 'line';
export const AREA_KINDS: readonly AreaKind[] = ['cone', 'sphere', 'cube', 'line'];

/** A size for each shape when the DM first picks it, in feet. */
export const AREA_DEFAULT_FT: Record<AreaKind, number> = {
  cone: 15,
  sphere: 20,
  cube: 10,
  line: 30,
};

/** A line's width, in feet (most line effects are 5 feet wide). */
export const LINE_WIDTH_FT = 5;

export interface AreaShape {
  kind: AreaKind;
  /** The point of origin, in map pixels. */
  origin: { x: number; y: number };
  /** Where the DM aims it (cone, cube, line); a sphere ignores it. */
  aim: { x: number; y: number };
  /** Length (cone, line), side (cube) or radius (sphere), in feet. */
  sizeFt: number;
}

export interface AreaGrid {
  cellPx: number;
  offsetX: number;
  offsetY: number;
}

export type AreaOutline =
  | {
      kind: 'polygon';
      points: Array<{ x: number; y: number }>;
      /** The point of origin: a cone's tip, the middle of a cube's or line's starting face. */
      origin: { x: number; y: number };
    }
  | { kind: 'circle'; cx: number; cy: number; r: number };

const PX_PER_FT = (grid: AreaGrid) => grid.cellPx / 5;

/** The unit vector from the origin to the aim; straight right when they coincide. */
function direction(shape: AreaShape): { x: number; y: number } {
  const dx = shape.aim.x - shape.origin.x;
  const dy = shape.aim.y - shape.origin.y;
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

/**
 * The shape's outline in map pixels. A cone is as wide at any point as it is far from its origin;
 * a cube's origin is the middle of the face it grows from; a line runs from its origin.
 */
export function areaOutline(shape: AreaShape, grid: AreaGrid): AreaOutline {
  const size = Math.max(0, shape.sizeFt) * PX_PER_FT(grid);
  const o = shape.origin;
  if (shape.kind === 'sphere') return { kind: 'circle', cx: o.x, cy: o.y, r: size };
  const d = direction(shape);
  const n = { x: -d.y, y: d.x };
  const at = (along: number, across: number) => ({
    x: o.x + d.x * along + n.x * across,
    y: o.y + d.y * along + n.y * across,
  });
  if (shape.kind === 'cone') {
    return { kind: 'polygon', points: [o, at(size, size / 2), at(size, -size / 2)], origin: o };
  }
  const half = shape.kind === 'cube' ? size / 2 : (LINE_WIDTH_FT * PX_PER_FT(grid)) / 2;
  return {
    kind: 'polygon',
    points: [at(0, half), at(size, half), at(size, -half), at(0, -half)],
    origin: o,
  };
}

function contains(outline: AreaOutline, p: { x: number; y: number }): boolean {
  if (outline.kind === 'circle') return Math.hypot(p.x - outline.cx, p.y - outline.cy) <= outline.r;
  let inside = false;
  const pts = outline.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Samples across each square: 6×6 points, so "at least half" is 18 of 36. */
const SAMPLES = 6;

/**
 * The squares the shape covers, as cell indices: those with at least half their area inside
 * (the 2024 rules' grid variant). Squares off the map's edge are left out.
 */
export function areaSquares(
  shape: AreaShape,
  grid: AreaGrid,
  map: { width: number; height: number },
): Array<{ x: number; y: number }> {
  const outline = areaOutline(shape, grid);
  const pts =
    outline.kind === 'circle'
      ? [
          { x: outline.cx - outline.r, y: outline.cy - outline.r },
          { x: outline.cx + outline.r, y: outline.cy + outline.r },
        ]
      : outline.points;
  const cell = grid.cellPx;
  const toCol = (x: number) => Math.floor((x - grid.offsetX) / cell);
  const toRow = (y: number) => Math.floor((y - grid.offsetY) / cell);
  const minC = Math.max(toCol(Math.min(...pts.map((p) => p.x))), toCol(0));
  const maxC = Math.min(toCol(Math.max(...pts.map((p) => p.x))), toCol(map.width - 1));
  const minR = Math.max(toRow(Math.min(...pts.map((p) => p.y))), toRow(0));
  const maxR = Math.min(toRow(Math.max(...pts.map((p) => p.y))), toRow(map.height - 1));
  const out: Array<{ x: number; y: number }> = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      let hits = 0;
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const p = {
            x: grid.offsetX + (c + (i + 0.5) / SAMPLES) * cell,
            y: grid.offsetY + (r + (j + 0.5) / SAMPLES) * cell,
          };
          if (contains(outline, p)) hits++;
        }
      }
      if (hits * 2 >= SAMPLES * SAMPLES) out.push({ x: c, y: r });
    }
  }
  return out;
}

/** The point of origin snapped to the nearest grid corner, where effects start on a grid. */
export function snapToCorner(
  p: { x: number; y: number },
  grid: AreaGrid,
): { x: number; y: number } {
  const cell = grid.cellPx;
  return {
    x: grid.offsetX + Math.round((p.x - grid.offsetX) / cell) * cell,
    y: grid.offsetY + Math.round((p.y - grid.offsetY) / cell) * cell,
  };
}

/** "15-ft cone", "20-ft sphere": the shape's name for the map's reading. */
export function areaLabel(kind: AreaKind, sizeFt: number): string {
  return `${sizeFt}-ft ${kind}`;
}
