import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  canPlaceUnder,
  descendantsOf,
  dropTarget,
  flattenTree,
  placeItem,
  type TreeItem,
} from './tree';

interface Item extends TreeItem {
  folder: boolean;
}

const item = (id: string, order: number, parentId: string | null = null, folder = false): Item => ({
  id,
  parentId,
  order,
  folder,
  createdAt: `2026-11-01T00:00:0${order}.000Z`,
});
const isFolder = (i: Item) => i.folder;

const items = [
  item('intro', 0),
  item('act1', 1, null, true),
  item('gate', 0, 'act1'),
  item('hall', 1, 'act1'),
  item('later', 2, 'act1', true),
  item('rumours', 0, 'later'),
  item('end', 2),
];

const place = (changed: Item[]) => changed.map((c) => `${c.id}@${c.parentId ?? 'root'}:${c.order}`);

describe('tree rows', () => {
  it('hides a collapsed folder’s rows', () => {
    expect(flattenTree(items, isFolder, new Set(['act1'])).map((r) => r.item.id)).toEqual([
      'intro',
      'act1',
      'end',
    ]);
  });

  it('lists descendants depth-first and ancestors root-first', () => {
    expect(descendantsOf(items, 'act1').map((i) => i.id)).toEqual([
      'gate',
      'hall',
      'later',
      'rumours',
    ]);
    expect(ancestorsOf(items, items[5]!).map((i) => i.id)).toEqual(['act1', 'later']);
  });

  it('never lets a folder go inside itself or its contents', () => {
    expect(canPlaceUnder(items, 'act1', 'act1')).toBe(false);
    expect(canPlaceUnder(items, 'act1', 'later')).toBe(false);
    expect(canPlaceUnder(items, 'act1', null)).toBe(true);
    expect(canPlaceUnder(items, 'gate', 'later')).toBe(true);
  });
});

describe('dropTarget', () => {
  it('lands before or after the row, in that row’s folder', () => {
    expect(dropTarget(items, isFolder, 'end', 'gate', 'before')).toEqual({
      parentId: 'act1',
      index: 0,
    });
    expect(dropTarget(items, isFolder, 'end', 'gate', 'after')).toEqual({
      parentId: 'act1',
      index: 1,
    });
  });

  it('skips the dragged row when counting siblings', () => {
    // Dragging gate below hall: hall is index 0 once gate is out of the way.
    expect(dropTarget(items, isFolder, 'gate', 'hall', 'after')).toEqual({
      parentId: 'act1',
      index: 1,
    });
  });

  it('puts an inside drop last in the folder, and refuses it on a note', () => {
    expect(dropTarget(items, isFolder, 'end', 'act1', 'inside')).toEqual({
      parentId: 'act1',
      index: 3,
    });
    expect(dropTarget(items, isFolder, 'end', 'gate', 'inside')).toBeNull();
  });

  it('refuses a drop onto itself or into its own contents', () => {
    expect(dropTarget(items, isFolder, 'gate', 'gate', 'before')).toBeNull();
    expect(dropTarget(items, isFolder, 'act1', 'later', 'inside')).toBeNull();
    expect(dropTarget(items, isFolder, 'act1', 'rumours', 'after')).toBeNull();
    expect(dropTarget(items, isFolder, 'act1', 'missing', 'after')).toBeNull();
  });
});

describe('placeItem', () => {
  it('renumbers the destination folder and reports only what changed', () => {
    expect(place(placeItem(items, 'end', 'act1', 0))).toEqual([
      'end@act1:0',
      'gate@act1:1',
      'hall@act1:2',
      'later@act1:3',
    ]);
  });

  it('moves within a folder without touching other folders', () => {
    expect(place(placeItem(items, 'hall', 'act1', 0))).toEqual(['hall@act1:0', 'gate@act1:1']);
  });

  it('clamps the index and returns nothing for a no-op or a forbidden move', () => {
    expect(place(placeItem(items, 'intro', null, 99))).toEqual([
      'act1@root:0',
      'end@root:1',
      'intro@root:2',
    ]);
    expect(placeItem(items, 'gate', 'act1', 0)).toEqual([]);
    expect(placeItem(items, 'act1', 'later', 0)).toEqual([]);
    expect(placeItem(items, 'missing', null, 0)).toEqual([]);
  });
});
