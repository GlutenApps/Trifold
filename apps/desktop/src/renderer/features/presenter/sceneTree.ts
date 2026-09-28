import type { Scene } from '@trifold/schema';

/** Tree helpers for the scene list (DESIGN.md §6.5): ordering, siblings, navigation. */

export interface TreeRow {
  scene: Scene;
  depth: number;
}

function sorted(scenes: readonly Scene[]): Scene[] {
  return [...scenes].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function childrenOf(scenes: readonly Scene[], parentId: string | null): Scene[] {
  return sorted(scenes.filter((s) => (s.parentId ?? null) === parentId));
}

/** Depth-first rows for rendering. Orphans (missing parent) are shown at the root. */
export function flattenTree(scenes: readonly Scene[]): TreeRow[] {
  const ids = new Set(scenes.map((s) => s.id));
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const scene of childrenOf(scenes, parentId)) {
      rows.push({ scene, depth });
      if (scene.kind === 'folder') walk(scene.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const scene of sorted(scenes)) {
    if (scene.parentId && !ids.has(scene.parentId)) rows.push({ scene, depth: 0 });
  }
  return rows;
}

export function siblingsOf(scenes: readonly Scene[], scene: Scene): Scene[] {
  return childrenOf(scenes, scene.parentId ?? null);
}

/** The scene `step` positions away among its siblings, wrapping. */
export function siblingAt(scenes: readonly Scene[], scene: Scene, step: 1 | -1): Scene | null {
  const siblings = siblingsOf(scenes, scene);
  if (siblings.length < 2) return null;
  const i = siblings.findIndex((s) => s.id === scene.id);
  return siblings[(i + step + siblings.length) % siblings.length] ?? null;
}

export function parentOf(scenes: readonly Scene[], scene: Scene): Scene | null {
  return scenes.find((s) => s.id === scene.parentId) ?? null;
}

export function firstChildOf(scenes: readonly Scene[], scene: Scene): Scene | null {
  return childrenOf(scenes, scene.id)[0] ?? null;
}

/** Next order value among a parent's children. */
export function nextOrder(scenes: readonly Scene[], parentId: string | null): number {
  const siblings = childrenOf(scenes, parentId);
  return siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
}

/** Swaps order values with the neighbouring sibling; returns the two scenes to save, or null. */
export function reorder(
  scenes: readonly Scene[],
  scene: Scene,
  step: 1 | -1,
): [Scene, Scene] | null {
  const siblings = siblingsOf(scenes, scene);
  const i = siblings.findIndex((s) => s.id === scene.id);
  const j = i + step;
  const other = siblings[j];
  if (i === -1 || !other) return null;
  // Renumber both from their positions so equal `order` values can't stick.
  return [
    { ...scene, order: j },
    { ...other, order: i },
  ];
}

export function matchesQuery(scene: Scene, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length === 0 || scene.title.toLowerCase().includes(q);
}
