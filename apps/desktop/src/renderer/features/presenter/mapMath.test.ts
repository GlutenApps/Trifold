import type { Token } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID,
  alignFromClicks,
  cameraRect,
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
