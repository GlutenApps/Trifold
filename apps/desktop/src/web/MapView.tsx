import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClientMap, ClientToken } from '@trifold/api';
import type { FogShape } from '@trifold/schema';
import {
  AreaLayer,
  FogLayer,
  GridLines,
  RulerLayer,
} from '../renderer/features/presenter/MapLayer';
import { cellCentre, squaresBetween } from '../renderer/features/presenter/ruler';
import { TokenDisc } from '../renderer/features/presenter/TokenDisc';

/** How long a phone waits before fetching a map picture again after a failed load. */
const MAP_RETRY_MS = 1500;

/**
 * The live map on a phone (docs/PLAYER-CONNECTOR.md): the fogged image the console drew, the fog
 * shapes over it for clean edges, the grid and the tokens this device may see. One finger on one
 * of the player's own tokens drags it; one finger anywhere else pans; a second finger cancels a
 * drag and pinch-zooms. A tap on an own token selects it. It fits the whole map on first sight
 * and keeps the player's framing after that.
 *
 * A move is a plan until the player confirms it (Move tool, Done): the token sits where it was
 * put, a faded copy marks where the move began and the ruler measures from there. Dragging the
 * planned token again adjusts the plan; it never snaps back to the start.
 */

interface View {
  x: number;
  y: number;
  scale: number;
}

/** A move in hand: where it began and where the token is planned to go (grid cells). */
export interface MovePlan {
  tokenId: string;
  origin: { x: number; y: number };
  at: { x: number; y: number };
  /** Done was pressed: waiting for the DM's Trifold to move it. */
  sending: boolean;
}

/** What the page does with moves; the server decides whether one lands. */
export interface DragHandlers {
  /** Token ids the player may move now (own, not locked). */
  movable: ReadonlySet<string>;
  plan: MovePlan | null;
  /** A move starts (the first movement of a drag, or a tap with Move open). */
  begin(tokenId: string, origin: { x: number; y: number }): void;
  /** The finger is moving the token: where it is now, for the TV. */
  dragging(tokenId: string, at: { x: number; y: number }, origin: { x: number; y: number }): void;
  /** The token was put down here: the plan to confirm. */
  planned(plan: MovePlan): void;
  /** Bumps when the server ended a move without it landing: the token goes back. */
  ended: { tokenId: string; n: number } | null;
}

interface Drag {
  tokenId: string;
  pointerId: number;
  origin: { x: number; y: number };
  /** Where this drag picked the token up (the plan's spot when adjusting one). */
  startAt: { x: number; y: number };
  /** Grid cells between the finger and the token's top-left corner. */
  offset: { x: number; y: number };
  at: { x: number; y: number };
  moved: boolean;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;
const PREVIEW_MS = 100;

const rounded = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });

export function MapView({
  map,
  selectedTokenId,
  onSelectToken,
  drag: handlers,
  tapMove,
  centerOn,
  fullScreen,
  onFullScreen,
  overlay,
}: {
  map: ClientMap;
  selectedTokenId: string | null;
  onSelectToken(tokenId: string): void;
  drag?: DragHandlers;
  /** With the Move tool open: a tap on the map plans a move of this token there. */
  tapMove?: string | null;
  /** The token Center on my token frames. */
  centerOn?: string | null;
  fullScreen?: boolean;
  onFullScreen?: () => void;
  /** Cards and banners floating over the map (initiative, Move). */
  overlay?: React.ReactNode;
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
  const lastPreview = useRef(0);
  const plan = handlers?.plan ?? null;
  const planRef = useRef<MovePlan | null>(plan);
  planRef.current = plan;

  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // The map picture: a new one (a fog change, another background) replaces the old only once it
  // has loaded, so the map never goes blank while the console draws and sends it. A failed load
  // tries again after a moment.
  const [shown, setShown] = useState<{ mapId: string; url: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const url = map.imageUrl;
    if (!url || (shown?.mapId === map.id && shown.url === url)) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const img = new Image();
    img.onload = () => {
      if (live) setShown({ mapId: map.id, url });
    };
    img.onerror = () => {
      if (live) timer = setTimeout(() => setRetry((n) => n + 1), MAP_RETRY_MS);
    };
    img.src = url;
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [map.id, map.imageUrl, shown, retry]);
  const imageUrl = shown?.mapId === map.id ? shown.url : undefined;
  // Loading: the scene has a picture and the one it has now is not on screen yet.
  const loading = map.hasImage && (!map.imageUrl || imageUrl !== map.imageUrl);

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

  // The map area grows and shrinks as tools open and close: keep the map framed in it.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = '';
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
      // Never re-frame under a move: the finger's spot on the map would jump (opening Move hides
      // the character strip and the map area grows mid-drag).
      if (last && size !== last && !dragRef.current && !planRef.current) fit();
      last = size;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // The server ended a move (refused, lapsed, or the DM took the token): drop the finger's drag.
  useEffect(() => {
    if (!handlers?.ended) return;
    if (dragRef.current?.tokenId === handlers.ended.tokenId) setDragBoth(null);
  }, [handlers?.ended]);

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

  /** Where a token is shown: in the finger, at its planned spot, or where the map has it. */
  const shownAt = (t: Pick<ClientToken, 'id' | 'x' | 'y'>) =>
    drag?.tokenId === t.id ? drag.at : plan?.tokenId === t.id ? plan.at : { x: t.x, y: t.y };

  const onPointerDown = (e: React.PointerEvent) => {
    box.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    // A second finger is a pinch: a drag in progress stops where it was (the plan stays).
    if (pts.length > 1 && dragRef.current) setDragBoth(null);
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-token-id]');
    const tokenId = target?.dataset['tokenId'];
    const token = tokenId ? map.tokens.find((t) => t.id === tokenId) : undefined;
    const sending = plan?.tokenId === token?.id && plan?.sending;
    if (pts.length === 1 && token && view && handlers?.movable.has(token.id) && !sending) {
      const cells = toCells(local(e));
      const ownPlan = plan?.tokenId === token.id ? plan : null;
      const startAt = ownPlan ? ownPlan.at : { x: token.x, y: token.y };
      setDragBoth({
        tokenId: token.id,
        pointerId: e.pointerId,
        origin: ownPlan ? ownPlan.origin : { x: token.x, y: token.y },
        startAt,
        offset: { x: cells.x - startAt.x, y: cells.y - startAt.y },
        at: startAt,
        moved: false,
      });
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
      const moved = d.moved || Math.abs(at.x - d.startAt.x) + Math.abs(at.y - d.startAt.y) > 0.2;
      // The move begins with the first movement, so a tap to select never takes the token.
      if (moved && !d.moved) handlers?.begin(d.tokenId, d.origin);
      setDragBoth({ ...d, at, moved });
      const now = Date.now();
      if (moved && handlers && now - lastPreview.current >= PREVIEW_MS) {
        lastPreview.current = now;
        handlers.dragging(d.tokenId, at, d.origin);
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
      if (!d.moved) onSelectToken(d.tokenId);
      else
        handlers?.planned({
          tokenId: d.tokenId,
          origin: d.origin,
          at: rounded(d.at),
          sending: false,
        });
      return;
    }
    const g = gesture.current;
    if (g && !g.moved && pointers.current.size === 0) {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-token-id]');
      const moving = tapMove ? map.tokens.find((t) => t.id === tapMove) : undefined;
      if (target?.dataset['mine'] === 'true') {
        onSelectToken(target.dataset['tokenId']!);
      } else if (moving && view && handlers?.movable.has(moving.id) && !plan?.sending) {
        // Tap a spot with Move open: the token's planned spot, the same as a drag.
        const cells = toCells(local(e));
        const origin = plan?.tokenId === moving.id ? plan.origin : { x: moving.x, y: moving.y };
        const at = rounded({
          x: cells.x - moving.footprint / 2,
          y: cells.y - moving.footprint / 2,
        });
        handlers.begin(moving.id, origin);
        handlers.planned({ tokenId: moving.id, origin, at, sending: false });
      }
    }
    const pts = [...pointers.current.values()];
    gesture.current = pts.length ? { dist: 0, mid: midpoint(pts), moved: g?.moved ?? false } : null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = local(e);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };

  const centre = () => {
    const el = box.current;
    const t = centerOn ? map.tokens.find((x) => x.id === centerOn) : undefined;
    if (!el || !t || !view) return;
    const at = shownAt(t);
    const { width, height } = el.getBoundingClientRect();
    const scale = Math.max(view.scale, Math.min(width, height) / (map.grid.cellPx * 8));
    const px = map.grid.offsetX + (at.x + t.footprint / 2) * map.grid.cellPx;
    const py = map.grid.offsetY + (at.y + t.footprint / 2) * map.grid.cellPx;
    setView({ scale, x: width / 2 - px * scale, y: height / 2 - py * scale });
  };

  const cell = map.grid.cellPx;
  const place = (t: Pick<ClientToken, 'x' | 'y' | 'footprint'>) => ({
    left: map.grid.offsetX + t.x * cell,
    top: map.grid.offsetY + t.y * cell,
    width: t.footprint * cell,
    height: t.footprint * cell,
  });

  // The move shown with its ghost and ruler: the finger's drag, else the plan.
  const move = drag?.moved
    ? { tokenId: drag.tokenId, from: drag.origin, to: rounded(drag.at) }
    : plan
      ? { tokenId: plan.tokenId, from: plan.origin, to: plan.at }
      : null;

  return (
    <div
      ref={box}
      className={`pc-map backdrop-${map.backdrop}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      // A long press is a drag or a pan here: never the browser's image menu.
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`Map: ${map.title}`}
      role="img"
      aria-busy={loading || undefined}
    >
      {loading && (
        <div className="pc-map-loading" data-testid="pc-map-loading">
          <span className="pc-spinner" aria-hidden="true" />
          Loading map…
        </div>
      )}
      {view && (
        <div
          className="pc-map-surface"
          style={{
            width: map.width,
            height: map.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {imageUrl ? (
            <img
              className="pc-map-art"
              src={imageUrl}
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
          {map.area && view && (
            <AreaLayer
              width={map.width}
              height={map.height}
              grid={map.grid}
              area={map.area}
              zoom={view.scale}
            />
          )}
          {map.fog && (
            <FogLayer
              width={map.width}
              height={map.height}
              shapes={map.fog as unknown as FogShape[]}
            />
          )}
          {(() => {
            // A faded copy where the move began and the ruler from there, so the player sees how
            // far it goes and where it came from before confirming.
            const token = move ? tokenOf(map, move.tokenId) : undefined;
            if (!move || !token || !view) return null;
            const fp = token.footprint;
            const squares = squaresBetween(move.from, move.to);
            return (
              <>
                {squares > 0 && (
                  <RulerLayer
                    width={map.width}
                    height={map.height}
                    from={cellCentre(move.from, map.grid, fp)}
                    to={cellCentre(move.to, map.grid, fp)}
                    squares={squares}
                    zoom={view.scale}
                  />
                )}
                {squares > 0 && (
                  <div
                    className="token-slot pc-token ghost"
                    data-testid="pc-move-ghost"
                    aria-hidden="true"
                    style={place({ ...move.from, footprint: fp })}
                  >
                    <TokenDisc
                      token={token}
                      style={map.tokenStyle}
                      size={fp * cell}
                      showLabel={false}
                    />
                  </div>
                )}
              </>
            );
          })()}
          {map.tokens.map((t) => {
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
                  plan?.tokenId === t.id ? 'planned' : '',
                  t.movingBy ? 'moving' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-token-id={t.id}
                data-mine={t.mine}
                data-testid="pc-token"
                style={place({ ...t, ...shownAt(t) })}
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
      {overlay}
      <div className="pc-mapbtns">
        {centerOn && (
          <button
            type="button"
            className="pc-round"
            onClick={centre}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            aria-label="Center on my token"
            title="Center on my token"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
        )}
        {onFullScreen && (
          <button
            type="button"
            className="pc-round"
            aria-pressed={!!fullScreen}
            onClick={onFullScreen}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            aria-label={fullScreen ? 'Leave full-screen map' : 'Full-screen map'}
            title={fullScreen ? 'Leave full-screen map' : 'Full-screen map'}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        )}
      </div>
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
