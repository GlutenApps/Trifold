import type { CameraRect } from '@trifold/api';
import type {
  GridSpec,
  PlayerCamera,
  Scene,
  SceneBackground,
  SceneImage,
  Token,
} from '@trifold/schema';

/** Pure geometry for map scenes (DESIGN.md §6.5): grid, snapping, cameras, party placement. */

export interface Point {
  x: number;
  y: number;
}

export const DEFAULT_GRID: GridSpec = {
  cellPx: 70,
  offsetX: 0,
  offsetY: 0,
  color: '#000000',
  opacity: 0.3,
  showToPlayers: true,
};

export const DEFAULT_BLANK = { cols: 30, rows: 20 };

/** Footprint in cells from a creature size code (T/S/M = 1, L = 2, H = 3, G = 4). */
export function footprintForSize(size: string | null | undefined): Token['footprint'] {
  switch ((size ?? '').trim().toUpperCase()) {
    case 'L':
      return 2;
    case 'H':
      return 3;
    case 'G':
      return 4;
    default:
      return 1;
  }
}

/** Map size in map pixels for any map-like scene. */
export function mapSize(scene: Scene): { width: number; height: number } {
  if (scene.image) return { width: scene.image.width, height: scene.image.height };
  const grid = scene.grid ?? DEFAULT_GRID;
  const blank = scene.blank ?? DEFAULT_BLANK;
  return { width: blank.cols * grid.cellPx, height: blank.rows * grid.cellPx };
}

export function pixelToGrid(px: number, py: number, grid: GridSpec): Point {
  return { x: (px - grid.offsetX) / grid.cellPx, y: (py - grid.offsetY) / grid.cellPx };
}

export function gridToPixel(x: number, y: number, grid: GridSpec): Point {
  return { x: grid.offsetX + x * grid.cellPx, y: grid.offsetY + y * grid.cellPx };
}

/** Snaps a token's top-left cell to whole cells. */
export function snap(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/**
 * Two-click alignment: the DM clicks opposite corners of one cell. Uses the mean of the two
 * spans so a slightly diagonal drag still gives a square cell.
 */
export function alignFromClicks(
  a: Point,
  b: Point,
): Pick<GridSpec, 'cellPx' | 'offsetX' | 'offsetY'> | null {
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  const cellPx = (w + h) / 2;
  if (cellPx < 4) return null;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    cellPx: Math.round(cellPx * 100) / 100,
    offsetX: Math.round((((left % cellPx) + cellPx) % cellPx) * 100) / 100,
    offsetY: Math.round((((top % cellPx) + cellPx) % cellPx) * 100) / 100,
  };
}

/** Bounding box of tokens in map pixels, or null when there are none. */
export function tokenBounds(tokens: readonly Token[], grid: GridSpec): CameraRect | null {
  const visible = tokens.filter((t) => !t.hidden);
  if (visible.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of visible) {
    const p = gridToPixel(t.x, t.y, grid);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + t.footprint * grid.cellPx);
    maxY = Math.max(maxY, p.y + t.footprint * grid.cellPx);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Grows a rect around its centre until it has the given aspect ratio (width / height). */
export function fitAspect(rect: CameraRect, aspect: number): CameraRect {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let { width, height } = rect;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

function padded(rect: CameraRect, pad: number): CameraRect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/**
 * The player camera as a rectangle in map pixels. `fitMap` shows everything; `fitTokens` frames
 * the visible tokens (falling back to the map); `follow` centres on the active token; `manual`
 * uses the stored centre and zoom (zoom 1 = whole map width).
 */
export function cameraRect(
  camera: PlayerCamera,
  size: { width: number; height: number },
  grid: GridSpec,
  tokens: readonly Token[],
  aspect: number,
  activeTokenId: string | null,
): CameraRect {
  const whole = fitAspect({ x: 0, y: 0, width: size.width, height: size.height }, aspect);
  const minWidth = Math.min(size.width, grid.cellPx * 8);
  switch (camera.mode) {
    case 'fitTokens': {
      const bounds = tokenBounds(tokens, grid);
      if (!bounds) return whole;
      const rect = fitAspect(padded(bounds, grid.cellPx * 2), aspect);
      return rect.width < minWidth ? fitAspect({ ...rect, width: minWidth }, aspect) : rect;
    }
    case 'follow': {
      const active = tokens.find((t) => t.id === activeTokenId && !t.hidden);
      if (!active)
        return cameraRect({ ...camera, mode: 'fitTokens' }, size, grid, tokens, aspect, null);
      const p = gridToPixel(active.x, active.y, grid);
      const width = Math.min(size.width, grid.cellPx * 16);
      const half = active.footprint * grid.cellPx * 0.5;
      return fitAspect({ x: p.x + half - width / 2, y: p.y + half, width, height: 0 }, aspect);
    }
    case 'manual': {
      const width = size.width / Math.max(0.1, camera.zoom);
      return fitAspect({ x: camera.x - width / 2, y: camera.y, width, height: 0 }, aspect);
    }
    default:
      return whole;
  }
}

/**
 * Party placement (DESIGN.md §6.5): a compact 2-wide column of cells around the clicked point.
 * Returns the top-left cell of each of `count` tokens, in order.
 */
export function partyFormation(count: number, centre: Point): Point[] {
  const rows = Math.ceil(count / 2);
  const originX = Math.round(centre.x - 1);
  const originY = Math.round(centre.y - rows / 2);
  const out: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ x: originX + (i % 2), y: originY + Math.floor(i / 2) });
  }
  return out;
}

/**
 * Placing a built encounter (ADR 0005): a near-square block around `centre` with one free cell
 * between neighbours, so each token is easy to grab. Returns each token's top-left cell, in order.
 */
export function encounterFormation(footprints: readonly number[], centre: Point): Point[] {
  if (footprints.length === 0) return [];
  const step = Math.max(...footprints) + 1;
  const cols = Math.ceil(Math.sqrt(footprints.length));
  const rows = Math.ceil(footprints.length / cols);
  const originX = Math.round(centre.x - (cols * step - 1) / 2);
  const originY = Math.round(centre.y - (rows * step - 1) / 2);
  return footprints.map((_, i) => ({
    x: originX + (i % cols) * step,
    y: originY + Math.floor(i / cols) * step,
  }));
}

/** The transform that shows `rect` inside a viewport of `vw` × `vh` CSS pixels, letterboxed. */
export function viewTransform(
  rect: CameraRect,
  vw: number,
  vh: number,
): { scale: number; tx: number; ty: number } {
  if (rect.width <= 0 || rect.height <= 0 || vw <= 0 || vh <= 0) return { scale: 1, tx: 0, ty: 0 };
  const scale = Math.min(vw / rect.width, vh / rect.height);
  return {
    scale,
    tx: vw / 2 - (rect.x + rect.width / 2) * scale,
    ty: vh / 2 - (rect.y + rect.height / 2) * scale,
  };
}

export function initials(label: string): string {
  const words = label
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/** Id for the one image of a map saved before it had background variants. */
export const ORIGINAL_BACKGROUND_ID = 'original';

/** A map's backgrounds; a map with only `image` has that one, named "Original". */
export function backgroundsOf(scene: Scene): SceneBackground[] {
  if (scene.backgrounds?.length) return scene.backgrounds;
  return scene.image ? [{ id: ORIGINAL_BACKGROUND_ID, name: 'Original', image: scene.image }] : [];
}

export function activeBackgroundOf(scene: Scene): SceneBackground | null {
  const all = backgroundsOf(scene);
  return all.find((b) => b.id === scene.activeBackgroundId) ?? all[0] ?? null;
}

/** True when two images have the same proportions, so one grid fits both. */
export function sameShape(a: SceneImage, b: SceneImage): boolean {
  return Math.abs(a.width / a.height - b.width / b.height) < 0.01;
}

/** Adds a variant without showing it (the DM may be preparing it while the map is live). */
export function addBackground(scene: Scene, background: SceneBackground): Scene {
  const all = backgroundsOf(scene);
  return {
    ...scene,
    backgrounds: [...all, background],
    activeBackgroundId: activeBackgroundOf(scene)?.id ?? background.id,
    ...(scene.image ? {} : { image: background.image }),
  };
}

/**
 * Shows a variant. Tokens and entry markers are in grid cells, so they stay put; the grid (and a
 * manual player camera) scale with the art's width, so a night render at another resolution
 * still lines up.
 */
export function showBackground(scene: Scene, id: string): Scene {
  const all = backgroundsOf(scene);
  const next = all.find((b) => b.id === id);
  if (!next) return scene;
  const ratio = scene.image ? next.image.width / scene.image.width : 1;
  const grid = scene.grid
    ? {
        ...scene.grid,
        cellPx: scene.grid.cellPx * ratio,
        offsetX: scene.grid.offsetX * ratio,
        offsetY: scene.grid.offsetY * ratio,
      }
    : scene.grid;
  const camera =
    scene.playerCamera.mode === 'manual'
      ? { ...scene.playerCamera, x: scene.playerCamera.x * ratio, y: scene.playerCamera.y * ratio }
      : scene.playerCamera;
  return {
    ...scene,
    backgrounds: all,
    activeBackgroundId: id,
    image: next.image,
    ...(grid ? { grid } : {}),
    playerCamera: camera,
  };
}

export function renameBackground(scene: Scene, id: string, name: string): Scene {
  return {
    ...scene,
    backgrounds: backgroundsOf(scene).map((b) => (b.id === id ? { ...b, name } : b)),
  };
}

/** Removes a variant (never the last); removing the one showing switches to the first left. */
export function removeBackground(scene: Scene, id: string): Scene {
  const remaining = backgroundsOf(scene).filter((b) => b.id !== id);
  if (remaining.length === 0) return scene;
  const next = { ...scene, backgrounds: remaining };
  return activeBackgroundOf(scene)?.id === id ? showBackground(next, remaining[0]!.id) : next;
}

/**
 * Swaps one variant's art for a new file, keeping its name. If it is the one showing, the map
 * switches to the new art the same way `showBackground` does (grid scaled to the new width).
 */
export function replaceBackgroundImage(scene: Scene, id: string, image: SceneImage): Scene {
  const all = backgroundsOf(scene);
  if (!all.some((b) => b.id === id)) return scene;
  const next = { ...scene, backgrounds: all.map((b) => (b.id === id ? { ...b, image } : b)) };
  return activeBackgroundOf(scene)?.id === id ? showBackground(next, id) : next;
}
