import type { Scene } from '@trifold/schema';
import * as tree from '@trifold/rules';

/**
 * Tree helpers for the scene list (DESIGN.md §6.5): ordering, siblings, navigation. The generic
 * tree code lives in `@trifold/rules` and is shared with the notes tree; these are the scene
 * flavour plus what only scenes need.
 */

export interface TreeRow {
  scene: Scene;
  depth: number;
}

const isFolder = (scene: Scene) => scene.kind === 'folder';

export function childrenOf(scenes: readonly Scene[], parentId: string | null): Scene[] {
  return tree.childrenOf(scenes, parentId);
}

/** Depth-first rows for rendering. Orphans (missing parent) are shown at the root. */
export function flattenTree(scenes: readonly Scene[]): TreeRow[] {
  return tree.flattenTree(scenes, isFolder).map(({ item, depth }) => ({ scene: item, depth }));
}

export function siblingsOf(scenes: readonly Scene[], scene: Scene): Scene[] {
  return tree.siblingsOf(scenes, scene);
}

/** The scene `step` positions away among its siblings, wrapping. */
export function siblingAt(scenes: readonly Scene[], scene: Scene, step: 1 | -1): Scene | null {
  return tree.siblingAt(scenes, scene, step);
}

export function parentOf(scenes: readonly Scene[], scene: Scene): Scene | null {
  return tree.parentOf(scenes, scene);
}

export function firstChildOf(scenes: readonly Scene[], scene: Scene): Scene | null {
  return tree.firstChildOf(scenes, scene);
}

/** Next order value among a parent's children. */
export function nextOrder(scenes: readonly Scene[], parentId: string | null): number {
  return tree.nextOrder(scenes, parentId);
}

/** Swaps order values with the neighbouring sibling; returns the two scenes to save, or null. */
export function reorder(
  scenes: readonly Scene[],
  scene: Scene,
  step: 1 | -1,
): [Scene, Scene] | null {
  return tree.reorder(scenes, scene, step);
}

export function matchesQuery(scene: Scene, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length === 0 || scene.title.toLowerCase().includes(q);
}

/**
 * The showable scene (anything but a folder) `step` positions away from `from` in tree order,
 * without wrapping; the first or last one when `from` is null. Drives the TV tab's previous and
 * next, which select (never send).
 */
export function showableAt(
  scenes: readonly Scene[],
  from: Scene | null,
  step: 1 | -1,
): Scene | null {
  const list = flattenTree(scenes)
    .map((r) => r.scene)
    .filter((s) => s.kind !== 'folder');
  if (list.length === 0) return null;
  if (!from) return step > 0 ? list[0]! : list[list.length - 1]!;
  const at = list.findIndex((s) => s.id === from.id);
  if (at === -1) return null;
  return list[at + step] ?? null;
}
