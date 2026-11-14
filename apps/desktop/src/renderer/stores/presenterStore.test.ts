import type { Scene, Token } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BLANK, DEFAULT_GRID } from '../features/presenter/mapMath';
import { liveSceneFrom } from './presenterStore';

function scene(kind: Scene['kind'], extra: Partial<Scene> = {}): Scene {
  return {
    schemaVersion: 1,
    id: `s-${kind}`,
    kind,
    title: 'Title',
    subtitle: '',
    showTitleOverride: null,
    parentId: null,
    order: 0,
    notes: '',
    tokens: [],
    entryMarkers: [],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function token(extra: Partial<Token>): Token {
  return {
    id: 't',
    kind: 'creature',
    ref: { kind: 'custom', name: 'Goblin' },
    label: 'Goblin',
    x: 1,
    y: 1,
    footprint: 1,
    role: 'enemy',
    hidden: false,
    nameMasked: true,
    dead: false,
    ...extra,
  };
}

describe('liveSceneFrom', () => {
  it('never sends folders, or image and map scenes without an image', () => {
    expect(liveSceneFrom(scene('folder'), 'camp')).toBeNull();
    expect(liveSceneFrom(scene('image'), 'camp')).toBeNull();
    expect(liveSceneFrom(scene('map'), 'camp')).toBeNull();
  });

  it('sends a title card with only the fields that are set', () => {
    expect(liveSceneFrom(scene('title'), 'camp')).toEqual({
      kind: 'title',
      id: 's-title',
      title: 'Title',
    });
    expect(liveSceneFrom(scene('title', { subtitle: 'Sub', backdrop: 'stone' }), 'camp')).toEqual({
      kind: 'title',
      id: 's-title',
      title: 'Title',
      subtitle: 'Sub',
      backdrop: 'stone',
    });
  });

  it('resolves an image scene to a media URL at its display size', () => {
    const live = liveSceneFrom(
      scene('image', {
        image: {
          path: 'images/a.png',
          displayPath: 'images/a.display.jpg',
          width: 1600,
          height: 900,
        },
      }),
      'the keep',
    );
    expect(live).toMatchObject({ kind: 'image', width: 1600, height: 900 });
    expect(live && 'imageUrl' in live ? live.imageUrl : '').toBe(
      'trifold-media://library/campaigns/the%20keep/images/a.display.jpg',
    );
  });

  it('gives a blank grid a parchment backdrop and drops hidden tokens', () => {
    const live = liveSceneFrom(
      scene('blankGrid', {
        grid: { ...DEFAULT_GRID },
        blank: { ...DEFAULT_BLANK },
        tokens: [
          token({ id: 'seen' }),
          token({ id: 'unseen', hidden: true }),
          token({ id: 'named', nameMasked: false, label: 'Boss', maskedLabel: 'Fiend' }),
        ],
      }),
      'camp',
    );
    expect(live?.kind).toBe('blankGrid');
    if (!live || live.kind !== 'blankGrid') throw new Error('expected a grid scene');
    expect(live.backdrop).toBe('parchment');
    expect(live.width).toBe(DEFAULT_BLANK.cols * DEFAULT_GRID.cellPx);
    expect(live.grid.visible).toBe(DEFAULT_GRID.showToPlayers);
    expect(live.tokens.map((t) => [t.id, t.label])).toEqual([
      ['seen', 'Creature'], // masked with no cached type → the generic label
      ['named', 'Boss'],
    ]);
  });

  it('leaves fogged tokens out, sends the fog, and frames only what the players see (ADR 0029)', () => {
    const grid = { ...DEFAULT_GRID, cellPx: 50, offsetX: 0, offsetY: 0 };
    const tokens = [
      token({ id: 'lit', x: 0, y: 0 }),
      token({ id: 'dark', x: 10, y: 10 }),
      token({ id: 'hidden', x: 1, y: 0, hidden: true }),
    ];
    const reveal = {
      id: 'r',
      mode: 'reveal' as const,
      kind: 'rect' as const,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    };
    const base = {
      grid,
      blank: { cols: 20, rows: 20 },
      tokens,
      playerCamera: { mode: 'fitTokens' as const, x: 0, y: 0, zoom: 1 },
    };
    const live = liveSceneFrom(
      scene('blankGrid', { ...base, fog: { enabled: true, shapes: [reveal] } }),
      'camp',
    );
    if (live?.kind !== 'blankGrid') throw new Error('expected a map');
    expect(live.tokens.map((t) => t.id)).toEqual(['lit']);
    expect(live.fog).toEqual({ shapes: [reveal] });
    // Fit tokens frames the one token the players can see, not the fogged one far away.
    expect(live.camera.x + live.camera.width).toBeLessThan(400);

    // Fog off: every token not hidden is sent, and no fog.
    const off = liveSceneFrom(
      scene('blankGrid', { ...base, fog: { enabled: false, shapes: [reveal] } }),
      'camp',
    );
    if (off?.kind !== 'blankGrid') throw new Error('expected a map');
    expect(off.tokens.map((t) => t.id)).toEqual(['lit', 'dark']);
    expect(off.fog).toBeUndefined();
  });
});
