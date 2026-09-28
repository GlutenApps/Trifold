import type { Scene, Token } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID,
  addBackground,
  backgroundsOf,
  removeBackground,
  replaceBackgroundImage,
  sameShape,
  showBackground,
  alignFromClicks,
  cameraRect,
  encounterFormation,
  fitAspect,
  footprintForSize,
  initials,
  partyFormation,
  snap,
  tokenBounds,
  viewTransform,
} from './mapMath';

function token(
  id: string,
  x: number,
  y: number,
  footprint: Token['footprint'] = 1,
  hidden = false,
): Token {
  return {
    id,
    kind: 'creature',
    ref: { kind: 'custom', name: id },
    label: id,
    x,
    y,
    footprint,
    role: 'enemy',
    hidden,
    nameMasked: true,
    dead: false,
  };
}

describe('map math', () => {
  it('maps size codes to footprints', () => {
    expect(['T', 'S', 'M', 'L', 'H', 'G', null].map(footprintForSize)).toEqual([
      1, 1, 1, 2, 3, 4, 1,
    ]);
  });

  it('derives the grid from two opposite corners of a cell', () => {
    expect(alignFromClicks({ x: 103, y: 52 }, { x: 173, y: 122 })).toEqual({
      cellPx: 70,
      offsetX: 33,
      offsetY: 52,
    });
    expect(alignFromClicks({ x: 10, y: 10 }, { x: 11, y: 12 })).toBeNull();
  });

  it('snaps to whole cells and bounds visible tokens', () => {
    expect(snap({ x: 2.4, y: 3.6 })).toEqual({ x: 2, y: 4 });
    const bounds = tokenBounds(
      [token('a', 1, 1), token('b', 4, 2, 2), token('c', 9, 9, 1, true)],
      DEFAULT_GRID,
    );
    expect(bounds).toEqual({ x: 70, y: 70, width: 350, height: 210 });
    expect(tokenBounds([], DEFAULT_GRID)).toBeNull();
  });

  it('grows rects to the display aspect around their centre', () => {
    expect(fitAspect({ x: 0, y: 0, width: 100, height: 100 }, 2)).toEqual({
      x: -50,
      y: 0,
      width: 200,
      height: 100,
    });
    expect(fitAspect({ x: 0, y: 0, width: 200, height: 50 }, 2)).toEqual({
      x: 0,
      y: -25,
      width: 200,
      height: 100,
    });
  });

  it('frames the whole map, the tokens, or the active token', () => {
    const size = { width: 2100, height: 1400 };
    const tokens = [token('a', 2, 2), token('b', 5, 4)];
    const fit = cameraRect(
      { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
      size,
      DEFAULT_GRID,
      tokens,
      16 / 9,
      null,
    );
    expect(fit.height).toBe(1400);
    expect(Math.round(fit.width)).toBe(2489);

    const framed = cameraRect(
      { mode: 'fitTokens', x: 0, y: 0, zoom: 1 },
      size,
      DEFAULT_GRID,
      tokens,
      1,
      null,
    );
    expect(framed.width).toBe(560);
    expect(framed.x).toBe(0);

    const follow = cameraRect(
      { mode: 'follow', x: 0, y: 0, zoom: 1 },
      size,
      DEFAULT_GRID,
      tokens,
      1,
      'b',
    );
    expect(follow.width).toBe(1120);
    expect(follow.x + follow.width / 2).toBe(385);

    const manual = cameraRect(
      { mode: 'manual', x: 1000, y: 700, zoom: 2 },
      size,
      DEFAULT_GRID,
      tokens,
      2,
      null,
    );
    expect(manual).toEqual({ x: 475, y: 437.5, width: 1050, height: 525 });
  });

  it('places the party as a two-wide column around the click', () => {
    expect(partyFormation(5, { x: 10, y: 10 })).toEqual([
      { x: 9, y: 9 },
      { x: 10, y: 9 },
      { x: 9, y: 10 },
      { x: 10, y: 10 },
      { x: 9, y: 11 },
    ]);
  });

  it('places an encounter as a spaced block around the point, clear of big footprints', () => {
    expect(encounterFormation([1, 1, 1, 1], { x: 10, y: 10 })).toEqual([
      { x: 9, y: 9 },
      { x: 11, y: 9 },
      { x: 9, y: 11 },
      { x: 11, y: 11 },
    ]);
    const mixed = encounterFormation([2, 1, 1], { x: 0, y: 0 });
    const cells = mixed.flatMap((p, i) => {
      const f = [2, 1, 1][i]!;
      return Array.from({ length: f * f }, (_, k) => `${p.x + (k % f)},${p.y + Math.floor(k / f)}`);
    });
    expect(new Set(cells).size).toBe(cells.length);
    expect(encounterFormation([], { x: 0, y: 0 })).toEqual([]);
  });

  it('letterboxes the camera rect into the viewport', () => {
    expect(viewTransform({ x: 0, y: 0, width: 200, height: 100 }, 1000, 1000)).toEqual({
      scale: 5,
      tx: 0,
      ty: 250,
    });
  });

  it('builds initials for plain tokens', () => {
    expect(initials('Goblin')).toBe('GO');
    expect(initials('Hill Giant (Ancient)')).toBe('HG');
    expect(initials('')).toBe('?');
  });
});

describe('background variants', () => {
  const day = { path: 'images/day.png', displayPath: 'images/day.jpg', width: 1400, height: 1000 };
  const night = { ...day, path: 'images/night.png', displayPath: 'images/night.jpg' };
  const nightHiRes = { ...night, width: 2800, height: 2000 };
  const mill = {
    kind: 'map',
    image: day,
    grid: { ...DEFAULT_GRID, cellPx: 70, offsetX: 10, offsetY: 4 },
    tokens: [{ id: 't', x: 3, y: 2 }],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  } as unknown as Scene;

  it('treats a map with one image as having that one background', () => {
    expect(backgroundsOf(mill).map((b) => b.name)).toEqual(['Original']);
  });

  it('adds a variant without showing it, then shows it with tokens left in place', () => {
    const added = addBackground(mill, { id: 'n', name: 'Night', image: night });
    expect(added.image).toBe(day);
    expect(added.backgrounds).toHaveLength(2);
    const shown = showBackground(added, 'n');
    expect(shown.image).toBe(night);
    expect(shown.activeBackgroundId).toBe('n');
    expect(shown.grid).toEqual(mill.grid);
    expect(shown.tokens).toBe(mill.tokens);
  });

  it('scales the grid and a manual camera when the art has another resolution', () => {
    const manual = { ...mill, playerCamera: { mode: 'manual', x: 300, y: 200, zoom: 2 } } as Scene;
    const shown = showBackground(
      addBackground(manual, { id: 'h', name: 'Hi', image: nightHiRes }),
      'h',
    );
    expect(shown.grid).toMatchObject({ cellPx: 140, offsetX: 20, offsetY: 8 });
    expect(shown.playerCamera).toMatchObject({ x: 600, y: 400, zoom: 2 });
    expect(sameShape(day, nightHiRes)).toBe(true);
    expect(sameShape(day, { ...day, height: 1400 })).toBe(false);
  });

  it('never removes the last background, and removing the shown one shows the first left', () => {
    expect(removeBackground(mill, 'original')).toBe(mill);
    const two = showBackground(addBackground(mill, { id: 'n', name: 'Night', image: night }), 'n');
    const back = removeBackground(two, 'n');
    expect(back.image).toBe(day);
    expect(back.activeBackgroundId).toBe('original');
    expect(back.backgrounds).toHaveLength(1);
  });
});

describe('replacing a background image', () => {
  const day = { path: 'images/day.png', displayPath: 'images/day.jpg', width: 1400, height: 1000 };
  const dusk = { ...day, path: 'images/dusk.png', displayPath: 'images/dusk.jpg' };
  const duskHiRes = { ...dusk, width: 2800, height: 2000 };
  const mill = {
    kind: 'map',
    image: day,
    grid: { ...DEFAULT_GRID, cellPx: 70 },
    tokens: [],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  } as unknown as Scene;

  it('swaps a hidden variant’s art and keeps its name, without changing what shows', () => {
    const two = addBackground(mill, { id: 'n', name: 'Night', image: dusk });
    const next = replaceBackgroundImage(two, 'n', duskHiRes);
    expect(next.backgrounds!.find((b) => b.id === 'n')).toMatchObject({ name: 'Night' });
    expect(next.backgrounds!.find((b) => b.id === 'n')!.image).toBe(duskHiRes);
    expect(next.image).toBe(day);
  });

  it('shows the new art at once when it replaces the one showing, rescaling the grid', () => {
    const next = replaceBackgroundImage(mill, 'original', duskHiRes);
    expect(next.image).toBe(duskHiRes);
    expect(next.backgrounds).toHaveLength(1);
    expect(next.grid?.cellPx).toBe(140);
  });
});
