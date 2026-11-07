import type { Scene } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import {
  firstChildOf,
  flattenTree,
  nextOrder,
  parentOf,
  reorder,
  showableAt,
  siblingAt,
} from './sceneTree';

function scene(
  id: string,
  order: number,
  parentId: string | null = null,
  kind: Scene['kind'] = 'title',
): Scene {
  return {
    schemaVersion: 1,
    id,
    kind,
    title: id,
    subtitle: '',
    showTitleOverride: null,
    parentId,
    order,
    notes: '',
    tokens: [],
    entryMarkers: [],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
    createdAt: `2026-09-28T00:00:0${order}.000Z`,
    updatedAt: '2026-09-28T00:00:00.000Z',
  };
}

const scenes = [
  scene('intro', 0),
  scene('act1', 1, null, 'folder'),
  scene('gate', 0, 'act1'),
  scene('hall', 1, 'act1'),
  scene('orphan', 0, 'missing'),
  scene('end', 2),
];

describe('scene tree', () => {
  it('flattens depth-first with orphans at the root', () => {
    expect(flattenTree(scenes).map((r) => `${'  '.repeat(r.depth)}${r.scene.id}`)).toEqual([
      'intro',
      'act1',
      '  gate',
      '  hall',
      'end',
      'orphan',
    ]);
  });

  it('navigates siblings with wrap, parent and first child', () => {
    const gate = scenes[2]!;
    expect(siblingAt(scenes, gate, 1)?.id).toBe('hall');
    expect(siblingAt(scenes, gate, -1)?.id).toBe('hall');
    expect(siblingAt(scenes, scenes[0]!, 1)?.id).toBe('act1');
    expect(parentOf(scenes, gate)?.id).toBe('act1');
    expect(firstChildOf(scenes, scenes[1]!)?.id).toBe('gate');
    expect(firstChildOf(scenes, gate)).toBeNull();
  });

  it('computes the next order and swaps neighbours', () => {
    expect(nextOrder(scenes, null)).toBe(3);
    expect(nextOrder(scenes, 'act1')).toBe(2);
    expect(nextOrder(scenes, 'empty')).toBe(0);
    const swapped = reorder(scenes, scenes[3]!, -1)!;
    expect(swapped.map((s) => [s.id, s.order])).toEqual([
      ['hall', 0],
      ['gate', 1],
    ]);
    expect(reorder(scenes, scenes[2]!, -1)).toBeNull();
  });

  it('steps through showable scenes in tree order, skipping folders, without wrapping', () => {
    const [intro, act1, gate, hall, orphan, end] = scenes as [
      Scene,
      Scene,
      Scene,
      Scene,
      Scene,
      Scene,
    ];
    expect(showableAt(scenes, intro, 1)?.id).toBe('gate');
    expect(showableAt(scenes, gate, 1)?.id).toBe('hall');
    expect(showableAt(scenes, hall, 1)?.id).toBe('end');
    expect(showableAt(scenes, end, 1)?.id).toBe('orphan');
    expect(showableAt(scenes, orphan, 1)).toBeNull();
    expect(showableAt(scenes, gate, -1)?.id).toBe('intro');
    expect(showableAt(scenes, intro, -1)).toBeNull();
    expect(showableAt(scenes, null, 1)?.id).toBe('intro');
    expect(showableAt(scenes, null, -1)?.id).toBe('orphan');
    expect(showableAt(scenes, act1, 1)).toBeNull();
    expect(showableAt([], null, 1)).toBeNull();
  });
});
