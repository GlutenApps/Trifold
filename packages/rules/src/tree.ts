/**
 * Tree helpers shared by the scene tree and the notes tree: ordering, siblings, navigation and
 * moves. An item sits under `parentId` (null at the root) at `order` among its siblings; ties
 * break on creation time. Folders are whatever `isFolder` says.
 */

export interface TreeItem {
  id: string;
  parentId?: string | null;
  order: number;
  createdAt: string;
}

export interface TreeRow<T extends TreeItem> {
  item: T;
  depth: number;
}

export type IsFolder<T> = (item: T) => boolean;

/** Where a dragged row is let go relative to the row under the pointer. */
export type DropPosition = 'before' | 'after' | 'inside';

function sorted<T extends TreeItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function childrenOf<T extends TreeItem>(items: readonly T[], parentId: string | null): T[] {
  return sorted(items.filter((s) => (s.parentId ?? null) === parentId));
}

/**
 * Depth-first rows for rendering. Orphans (missing parent) are shown at the root. Folders in
 * `collapsed` keep their rows out of the list.
 */
export function flattenTree<T extends TreeItem>(
  items: readonly T[],
  isFolder: IsFolder<T>,
  collapsed: ReadonlySet<string> = new Set(),
): TreeRow<T>[] {
  const ids = new Set(items.map((s) => s.id));
  const rows: TreeRow<T>[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of childrenOf(items, parentId)) {
      rows.push({ item, depth });
      if (isFolder(item) && !collapsed.has(item.id)) walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const item of sorted(items)) {
    if (item.parentId && !ids.has(item.parentId)) rows.push({ item, depth: 0 });
  }
  return rows;
}

export function siblingsOf<T extends TreeItem>(items: readonly T[], item: T): T[] {
  return childrenOf(items, item.parentId ?? null);
}

/** The item `step` positions away among its siblings, wrapping. */
export function siblingAt<T extends TreeItem>(
  items: readonly T[],
  item: T,
  step: 1 | -1,
): T | null {
  const siblings = siblingsOf(items, item);
  if (siblings.length < 2) return null;
  const i = siblings.findIndex((s) => s.id === item.id);
  return siblings[(i + step + siblings.length) % siblings.length] ?? null;
}

export function parentOf<T extends TreeItem>(items: readonly T[], item: T): T | null {
  return items.find((s) => s.id === item.parentId) ?? null;
}

export function firstChildOf<T extends TreeItem>(items: readonly T[], item: T): T | null {
  return childrenOf(items, item.id)[0] ?? null;
}

/** Next order value among a parent's children. */
export function nextOrder<T extends TreeItem>(
  items: readonly T[],
  parentId: string | null,
): number {
  const siblings = childrenOf(items, parentId);
  return siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
}

/** Swaps order values with the neighbouring sibling; returns the two items to save, or null. */
export function reorder<T extends TreeItem>(
  items: readonly T[],
  item: T,
  step: 1 | -1,
): [T, T] | null {
  const siblings = siblingsOf(items, item);
  const i = siblings.findIndex((s) => s.id === item.id);
  const j = i + step;
  const other = siblings[j];
  if (i === -1 || !other) return null;
  // Renumber both from their positions so equal `order` values can't stick.
  return [
    { ...item, order: j },
    { ...other, order: i },
  ];
}

/** Every item under `id`, depth-first: the contents of a folder. */
export function descendantsOf<T extends TreeItem>(items: readonly T[], id: string): T[] {
  const out: T[] = [];
  const walk = (parentId: string) => {
    for (const child of childrenOf(items, parentId)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** The folders from the root down to `item`'s parent, nearest last. */
export function ancestorsOf<T extends TreeItem>(items: readonly T[], item: T): T[] {
  const out: T[] = [];
  const seen = new Set<string>([item.id]);
  let cursor = parentOf(items, item);
  while (cursor && !seen.has(cursor.id)) {
    out.unshift(cursor);
    seen.add(cursor.id);
    cursor = parentOf(items, cursor);
  }
  return out;
}

/** True when `id` may become a child of `parentId`: not itself, not anything it holds. */
export function canPlaceUnder<T extends TreeItem>(
  items: readonly T[],
  id: string,
  parentId: string | null,
): boolean {
  if (parentId === null) return true;
  if (parentId === id) return false;
  return !descendantsOf(items, id).some((d) => d.id === parentId);
}

/**
 * Where a drop lands: the folder and index for `draggedId` let go `position` relative to
 * `targetId`. `inside` goes last in a folder (ignored on anything else). Null when the drop
 * would put a folder into itself, or the ids are unknown.
 */
export function dropTarget<T extends TreeItem>(
  items: readonly T[],
  isFolder: IsFolder<T>,
  draggedId: string,
  targetId: string,
  position: DropPosition,
): { parentId: string | null; index: number } | null {
  const target = items.find((i) => i.id === targetId);
  if (!target || targetId === draggedId) return null;
  if (position === 'inside') {
    if (!isFolder(target) || !canPlaceUnder(items, draggedId, target.id)) return null;
    return { parentId: target.id, index: childrenOf(items, target.id).length };
  }
  const parentId = target.parentId ?? null;
  if (!canPlaceUnder(items, draggedId, parentId)) return null;
  const siblings = childrenOf(items, parentId).filter((s) => s.id !== draggedId);
  const at = siblings.findIndex((s) => s.id === targetId);
  return { parentId, index: position === 'before' ? at : at + 1 };
}

/**
 * Puts `id` under `parentId` at `index` among the siblings there (clamped) and renumbers that
 * folder from 0. Returns every item whose place changed, ready to save; empty when nothing
 * moves or the move is not allowed.
 */
export function placeItem<T extends TreeItem>(
  items: readonly T[],
  id: string,
  parentId: string | null,
  index: number,
): T[] {
  const item = items.find((i) => i.id === id);
  if (!item || !canPlaceUnder(items, id, parentId)) return [];
  const siblings = childrenOf(items, parentId).filter((s) => s.id !== id);
  const at = Math.max(0, Math.min(index, siblings.length));
  siblings.splice(at, 0, { ...item, parentId });
  return siblings
    .map((s, order) => ({ ...s, order }))
    .filter((s) => {
      const before = items.find((i) => i.id === s.id)!;
      return (before.parentId ?? null) !== (s.parentId ?? null) || before.order !== s.order;
    });
}
