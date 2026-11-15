import { describe, expect, it } from 'vitest';
import { fogKey } from '../fog';
import { companionsOf, DragLocks, dropProblem, movementLocked, snapToCell } from './movement';
import type { TableCreature, TableScene, TableToken } from './types';
import { viewFor } from './view';

const grid = { cellPx: 10, offsetX: 0, offsetY: 0, color: '#000', opacity: 0.3, visible: true };
const fog = {
  enabled: true as const,
  shapes: [{ mode: 'reveal' as const, kind: 'rect' as const, x: 0, y: 0, w: 50, h: 100 }],
};
const scene: TableScene = {
  id: 's',
  title: 'Bridge',
  width: 100,
  height: 100,
  backdrop: 'dark',
  hasImage: false,
  grid,
  fog,
  fogKey: fogKey(fog),
  tokenStyle: 'engraved',
  tokens: [],
};
const token: TableToken = {
  id: 'tb',
  kind: 'pc',
  x: 1,
  y: 1,
  footprint: 1,
  label: 'Brannoc Hale',
  role: 'ally',
  hidden: false,
  dead: false,
  creature: { kind: 'pc', id: 'brannoc' },
};

describe('DragLocks', () => {
  it('gives a token to one device at a time and refreshes for the holder', () => {
    const locks = new DragLocks(3000);
    expect(locks.grant('tb', 'd1', 0)).toBe(true);
    expect(locks.grant('tb', 'd2', 100)).toBe(false);
    expect(locks.grant('tb', 'd1', 200)).toBe(true);
    expect(locks.refresh('tb', 'd2', 300)).toBe(false);
    expect(locks.refresh('tb', 'd1', 2900)).toBe(true);
    expect(locks.holder('tb', 5800)).toBe('d1');
  });

  it('lets a lock lapse after three seconds without a heartbeat', () => {
    const locks = new DragLocks(3000);
    locks.grant('tb', 'd1', 0);
    expect(locks.holder('tb', 2999)).toBe('d1');
    expect(locks.holder('tb', 3000)).toBeNull();
    expect(locks.sweep(3000)).toEqual([{ tokenId: 'tb', deviceId: 'd1' }]);
    expect(locks.grant('tb', 'd2', 3001)).toBe(true);
  });

  it('ends a lock or all of a device’s, as the DM grab and a disconnect do', () => {
    const locks = new DragLocks();
    locks.grant('tb', 'd1', 0);
    locks.grant('tw', 'd1', 0);
    expect(locks.release('tb')).toBe('d1');
    expect(locks.releaseDevice('d1')).toEqual(['tw']);
    expect(locks.active(0).size).toBe(0);
  });
});

describe('dropProblem', () => {
  it('accepts a drop in a revealed area', () => {
    expect(dropProblem(scene, token, { x: 3, y: 4 }, { x: 1, y: 1 })).toBeNull();
  });
  it('refuses a drop whose centre lands under fog', () => {
    expect(dropProblem(scene, token, { x: 6, y: 1 }, { x: 1, y: 1 })).toMatch(/see/);
  });
  it('refuses a stale drop: the token moved since the grab', () => {
    expect(dropProblem(scene, token, { x: 3, y: 3 }, { x: 2, y: 2 })).toMatch(/moved/);
  });
  it('refuses a drop off the map', () => {
    expect(dropProblem(scene, token, { x: -3, y: 1 }, { x: 1, y: 1 })).toMatch(/map/);
    expect(dropProblem(scene, token, { x: 2, y: 40 }, { x: 1, y: 1 })).toMatch(/map/);
  });
  it('snaps to whole cells', () => {
    expect(snapToCell({ x: 2.4, y: 3.6 })).toEqual({ x: 2, y: 4 });
  });
});

describe('movement locks and companions', () => {
  it('locks everyone or one creature', () => {
    expect(movementLocked({ all: true, creatures: [] }, 'pc', 'b')).toBe(true);
    expect(movementLocked({ all: false, creatures: ['pc:b'] }, 'pc', 'b')).toBe(true);
    expect(movementLocked({ all: false, creatures: ['pc:b'] }, 'pc', 'w')).toBe(false);
  });

  const creature = (id: string, extra: Partial<TableCreature> = {}): TableCreature => ({
    kind: 'npc',
    id,
    name: id,
    claimable: false,
    hp: null,
    ac: null,
    conditions: [],
    inFight: false,
    needsInitiative: false,
    editable: { hp: false, maxHp: false, ac: false, conditions: false },
    ...extra,
  });

  it('finds a PC’s companions', () => {
    const list = [
      creature('owl', { companionOf: 'b' }),
      creature('wolf', { companionOf: 'w' }),
      creature('tobin'),
    ];
    expect(companionsOf(list, 'b').map((c) => c.id)).toEqual(['owl']);
  });

  it('marks a token another device is dragging, and the owner’s locked movement', () => {
    const snap = {
      campaignId: 'c',
      campaignName: 'G',
      scene: {
        ...scene,
        tokens: [token, { ...token, id: 'tw', creature: { kind: 'pc' as const, id: 'wren' } }],
      },
      creatures: [
        creature('brannoc', { kind: 'pc', claimable: true }),
        creature('wren', { kind: 'pc', claimable: true }),
      ],
    };
    const claims = [
      { creatureKind: 'pc' as const, creatureId: 'brannoc', deviceId: 'd1' },
      { creatureKind: 'pc' as const, creatureId: 'wren', deviceId: 'd2' },
    ];
    const view = viewFor(snap, claims, 'd1', false, {
      movement: { all: false, creatures: ['pc:brannoc'] },
      dragging: new Map([['tw', { deviceId: 'd2', label: 'Wren’s tablet' }]]),
    });
    expect(view.mine[0]!.movementLocked).toBe(true);
    expect(view.map!.tokens.find((t) => t.id === 'tw')!.movingBy).toBe('Wren’s tablet');
    expect(view.map!.tokens.find((t) => t.id === 'tb')!.movingBy).toBeUndefined();
  });
});

describe('dropProblem during a drag preview', () => {
  it('checks staleness against where the token rests, not where the drag shows it', () => {
    const dragged = { ...token, x: 3, y: 1, restsAt: { x: 1, y: 1 } };
    expect(dropProblem(scene, dragged, { x: 3, y: 1 }, { x: 1, y: 1 })).toBeNull();
    expect(dropProblem(scene, dragged, { x: 3, y: 1 }, { x: 2, y: 1 })).toMatch(/moved/);
  });
});
