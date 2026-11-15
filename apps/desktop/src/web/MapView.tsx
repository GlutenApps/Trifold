import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClientMap, ClientToken } from '@trifold/api';
import type { FogShape } from '@trifold/schema';
import { FogLayer, GridLines } from '../renderer/features/presenter/MapLayer';
import { TokenDisc } from '../renderer/features/presenter/TokenDisc';

/**
 * The live map on a phone (docs/PLAYER-CONNECTOR.md): the fogged image the console drew, the fog
 * shapes over it for clean edges, the grid and the tokens this device may see. One finger on one
 * of the player's own tokens drags it (Phase 3); one finger anywhere else pans; a second finger
 * cancels a drag and pinch-zooms. A tap on an own token selects it. It fits the whole map on
 * first sight and keeps the player's framing after that.
 */

interface View {
  x: number;
  y: number;
  scale: number;
}

/** What the page does with a drag; the server decides whether it lands. */
export interface DragHandlers {
  /** Token ids the player may drag now (own, not locked). */
  movable: ReadonlySet<string>;
  grab(tokenId: string): void;
  preview(tokenId: string, x: number, y: number): void;
  hold(tokenId: string): void;
  drop(tokenId: string, x: number, y: number, from: { x: number; y: number }): void;
  letGo(tokenId: string): void;
  /** Bumps when the server ended a drag without a move: the token snaps back. */
  ended: { tokenId: string; n: number } | null;
}

interface Drag {
  tokenId: string;
  pointerId: number;
  start: { x: number; y: number };
  /** Grid cells between the finger and the token's top-left corner. */
  offset: { x: number; y: number };
  at: { x: number; y: number };
  moved: boolean;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;
const PREVIEW_MS = 100;
const HOLD_MS = 1000;

export function MapView({
  map,
  selectedTokenId,
  onSelectToken,
  drag: handlers,
}: {
  map: ClientMap;
  selectedTokenId: string | null;
  onSelectToken(tokenId: string): void;
  drag?: DragHandlers;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; moved: boolean } | null>(
    null,
  );
  const fittedFor = useRef<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  /** A drop waiting for the server: shown where it was put until the map agrees or refuses. */
  const [pending, setPending] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  const lastPreview = useRef(0);

  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    const scale = Math.min(width / map.width, height / map.height);
    setView({
      scale,
      x: (width - map.width * scale) / 2,
      y: (height - map.height * scale) / 2,
    });
  }, [map.width, map.height]);

  // A new scene is framed whole; the same scene keeps the player's pan and zoom.
  useLayoutEffect(() => {
    if (fittedFor.current === map.id) return;
    fittedFor.current = map.id;
    fit();
  }, [map.id, fit]);

  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener('orientationchange', onResize);
    return () => window.removeEventListener('orientationchange', onResize);
  }, [fit]);

  // The server refused or ended a drag: the token goes back where the map has it.
  useEffect(() => {
    if (!handlers?.ended) return;
    const { tokenId } = handlers.ended;
    if (dragRef.current?.tokenId === tokenId) setDragBoth(null);
    setPending((p) => (p?.tokenId === tokenId ? null : p));
  }, [handlers?.ended]);

  // A drop the map now shows (or that moved elsewhere) is no longer pending.
  useEffect(() => {
    if (!pending) return;
    const t = map.tokens.find((x) => x.id === pending.tokenId);
    if (!t || (t.x === pending.x && t.y === pending.y)) setPending(null);
  }, [map.tokens, pending]);

  // A finger held still keeps the lock alive.
  useEffect(() => {
    if (!drag || !handlers) return;
    const t = window.setInterval(() => handlers.hold(drag.tokenId), HOLD_MS);
    return () => window.clearInterval(t);
  }, [drag?.tokenId, handlers]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      if (!v) return v;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** A screen point in grid cells. */
  const toCells = (p: { x: number; y: number }) => {
    const v = view!;
    const cell = map.grid.cellPx;
    return {
      x: ((p.x - v.x) / v.scale - map.grid.offsetX) / cell,
      y: ((p.y - v.y) / v.scale - map.grid.offsetY) / cell,
    };
  };

  const cancelDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    handlers?.letGo(d.tokenId);
    setDragBoth(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    box.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    if (pts.length > 1) cancelDrag();
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-token-id]');
    const tokenId = target?.dataset['tokenId'];
    const token = tokenId ? map.tokens.find((t) => t.id === tokenId) : undefined;
    if (pts.length === 1 && token && view && handlers?.movable.has(token.id)) {
      const cells = toCells(local(e));
      const d: Drag = {
        tokenId: token.id,
        pointerId: e.pointerId,
        start: { x: token.x, y: token.y },
        offset: { x: cells.x - token.x, y: cells.y - token.y },
        at: { x: token.x, y: token.y },
        moved: false,
      };
      setDragBoth(d);
      handlers.grab(token.id);
      gesture.current = null;
      return;
    }
    gesture.current = {
      dist: pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0,
      mid: midpoint(pts),
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const d = dragRef.current;
    if (d && d.pointerId === e.pointerId) {
      const cells = toCells(local(e));
      const at = { x: cells.x - d.offset.x, y: cells.y - d.offset.y };
      const moved = d.moved || Math.abs(at.x - d.start.x) + Math.abs(at.y - d.start.y) > 0.2;
      setDragBoth({ ...d, at, moved });
      const now = Date.now();
      if (moved && handlers && now - lastPreview.current >= PREVIEW_MS) {
        lastPreview.current = now;
        handlers.preview(d.tokenId, at.x, at.y);
      }
      return;
    }
    if (!gesture.current) return;
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const mid = midpoint(pts);
    const dx = mid.x - g.mid.x;
    const dy = mid.y - g.mid.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
    setView((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v));
    if (pts.length > 1) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (g.dist > 0) zoomAt(dist / g.dist, mid.x, mid.y);
      g.dist = dist;
      g.moved = true;
    }
    g.mid = mid;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    pointers.current.delete(e.pointerId);
    if (d && d.pointerId === e.pointerId) {
      setDragBoth(null);
      if (!d.moved) {
        handlers?.letGo(d.tokenId);
        onSelectToken(d.tokenId);
      } else {
        const x = Math.round(d.at.x);
        const y = Math.round(d.at.y);
        setPending({ tokenId: d.tokenId, x, y });
        handlers?.drop(d.tokenId, x, y, d.start);
      }
      return;
    }
    const g = gesture.current;
    if (g && !g.moved && pointers.current.size === 0) {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-token-id]');
      if (target?.dataset['mine'] === 'true') onSelectToken(target.dataset['tokenId']!);
    }
    const pts = [...pointers.current.values()];
    gesture.current = pts.length ? { dist: 0, mid: midpoint(pts), moved: g?.moved ?? false } : null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = local(e);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };

  const cell = map.grid.cellPx;
  const place = (t: Pick<ClientToken, 'x' | 'y' | 'footprint'>) => ({
    left: map.grid.offsetX + t.x * cell,
    top: map.grid.offsetY + t.y * cell,
    width: t.footprint * cell,
    height: t.footprint * cell,
  });

  return (
    <div
      ref={box}
      className={`pc-map backdrop-${map.backdrop}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      aria-label={`Map: ${map.title}`}
      role="img"
    >
      {view && (
        <div
          className="pc-map-surface"
          style={{
            width: map.width,
            height: map.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {map.imageUrl ? (
            <img
              className="pc-map-art"
              src={map.imageUrl}
              width={map.width}
              height={map.height}
              alt=""
              draggable={false}
            />
          ) : (
            <div
              className={`map-blank backdrop-${map.backdrop}`}
              style={{ width: map.width, height: map.height }}
            />
          )}
          {map.grid.visible && <GridLines width={map.width} height={map.height} grid={map.grid} />}
          {map.fog && (
            <FogLayer
              width={map.width}
              height={map.height}
              shapes={map.fog as unknown as FogShape[]}
            />
          )}
          {drag?.moved && (
            <div
              className="token-slot pc-token ghost"
              aria-hidden="true"
              style={place({
                ...drag.start,
                footprint: tokenOf(map, drag.tokenId)?.footprint ?? 1,
              })}
            />
          )}
          {map.tokens.map((t) => {
            const at =
              drag?.tokenId === t.id
                ? drag.at
                : pending?.tokenId === t.id
                  ? pending
                  : { x: t.x, y: t.y };
            const movable = !!handlers?.movable.has(t.id);
            return (
              <div
                key={t.id}
                className={[
                  'token-slot',
                  'pc-token',
                  t.mine ? 'mine' : '',
                  t.fogged ? 'fogged' : '',
                  movable ? 'movable' : '',
                  drag?.tokenId === t.id ? 'dragging' : '',
                  t.movingBy ? 'moving' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-token-id={t.id}
                data-mine={t.mine}
                data-testid="pc-token"
                style={place({ ...t, ...at })}
              >
                <TokenDisc
                  token={t}
                  style={map.tokenStyle}
                  size={t.footprint * cell}
                  selected={t.id === selectedTokenId}
                />
                {t.movingBy && <span className="pc-mover">{t.movingBy}</span>}
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className="pc-fit"
        onClick={fit}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Show the whole map"
        title="Show the whole map"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

const tokenOf = (map: ClientMap, id: string) => map.tokens.find((t) => t.id === id);

function midpoint(pts: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (!pts.length) return { x: 0, y: 0 };
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}
