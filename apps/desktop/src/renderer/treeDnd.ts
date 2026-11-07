import { useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import {
  childrenOf,
  dropTarget,
  type DropPosition,
  type IsFolder,
  type TreeItem,
} from '@trifold/rules';

/**
 * Drag and drop for a tree of rows (scenes, notes): drag a row onto another to put it before or
 * after it, onto a folder's middle to put it inside, or onto the empty space below the rows to
 * put it last at the root. The hook keeps what is being dragged and where it would land; the
 * caller renders the hint from `rowClass` and saves the move from `onMove`.
 */
export interface TreeDnd<T extends TreeItem> {
  draggingId: string | null;
  rowProps(item: T): {
    draggable: true;
    onDragStart(e: ReactDragEvent<HTMLElement>): void;
    onDragEnd(): void;
    onDragOver(e: ReactDragEvent<HTMLElement>): void;
    onDragLeave(e: ReactDragEvent<HTMLElement>): void;
    onDrop(e: ReactDragEvent<HTMLElement>): void;
  };
  /** ' dragging', ' drop-before', ' drop-after', ' drop-inside' or ''. */
  rowClass(item: T): string;
  /** For the element holding the rows: a drop on its empty space goes last at the root. */
  containerProps: {
    onDragOver(e: ReactDragEvent<HTMLElement>): void;
    onDragLeave(e: ReactDragEvent<HTMLElement>): void;
    onDrop(e: ReactDragEvent<HTMLElement>): void;
  };
  /** ' drop-root' while a drop on the empty space is offered, else ''. */
  containerClass: string;
}

interface Over {
  id: string;
  position: DropPosition;
}

/** Where in a row the pointer is: a folder offers before, inside and after; a leaf before and after. */
export function positionIn(rect: DOMRect, clientY: number, folder: boolean): DropPosition {
  const ratio = rect.height ? (clientY - rect.top) / rect.height : 0.5;
  if (folder) return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
  return ratio < 0.5 ? 'before' : 'after';
}

export function useTreeDnd<T extends TreeItem>({
  items,
  isFolder,
  onMove,
}: {
  items: readonly T[];
  isFolder: IsFolder<T>;
  onMove(id: string, parentId: string | null, index: number): void;
}): TreeDnd<T> {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [overRoot, setOverRoot] = useState(false);
  // Drag events on other rows can't read the data transfer, so the id travels in a ref too.
  const dragging = useRef<string | null>(null);

  const finish = () => {
    dragging.current = null;
    setDraggingId(null);
    setOver(null);
    setOverRoot(false);
  };

  const rowProps: TreeDnd<T>['rowProps'] = (item) => ({
    draggable: true,
    onDragStart: (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
      dragging.current = item.id;
      setDraggingId(item.id);
    },
    onDragEnd: finish,
    onDragOver: (e) => {
      const id = dragging.current;
      if (!id) return;
      e.stopPropagation();
      const position = positionIn(
        e.currentTarget.getBoundingClientRect(),
        e.clientY,
        isFolder(item),
      );
      const target = dropTarget(items, isFolder, id, item.id, position);
      setOverRoot(false);
      if (!target) {
        e.dataTransfer.dropEffect = 'none';
        setOver(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver((prev) =>
        prev && prev.id === item.id && prev.position === position
          ? prev
          : { id: item.id, position },
      );
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver((prev) => (prev?.id === item.id ? null : prev));
    },
    onDrop: (e) => {
      const id = dragging.current ?? e.dataTransfer.getData('text/plain');
      e.stopPropagation();
      e.preventDefault();
      if (!id) return finish();
      const position = positionIn(
        e.currentTarget.getBoundingClientRect(),
        e.clientY,
        isFolder(item),
      );
      const target = dropTarget(items, isFolder, id, item.id, position);
      finish();
      if (target) onMove(id, target.parentId, target.index);
    },
  });

  const rowClass: TreeDnd<T>['rowClass'] = (item) => {
    if (item.id === draggingId) return ' dragging';
    if (over?.id === item.id) return ` drop-${over.position}`;
    return '';
  };

  const containerProps: TreeDnd<T>['containerProps'] = {
    onDragOver: (e) => {
      if (!dragging.current || e.target !== e.currentTarget) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(null);
      setOverRoot(true);
    },
    onDragLeave: (e) => {
      if (e.target === e.currentTarget) setOverRoot(false);
    },
    onDrop: (e) => {
      const id = dragging.current ?? e.dataTransfer.getData('text/plain');
      e.preventDefault();
      finish();
      if (id) onMove(id, null, childrenOf(items, null).length);
    },
  };

  return {
    draggingId,
    rowProps,
    rowClass,
    containerProps,
    containerClass: overRoot ? ' drop-root' : '',
  };
}
