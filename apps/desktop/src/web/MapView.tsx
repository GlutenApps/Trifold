import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClientMap } from '@trifold/api';
import type { FogShape } from '@trifold/schema';
import { FogLayer, GridLines } from '../renderer/features/presenter/MapLayer';
import { TokenDisc } from '../renderer/features/presenter/TokenDisc';

/**
 * The live map on a phone (docs/PLAYER-CONNECTOR.md, Phase 1): the fogged image the console drew,
 * the fog shapes over it for clean edges, the grid and the tokens this device may see. One
 * finger pans, two pinch-zoom; a tap on one of the player's own tokens selects it. It fits the
 * whole map on first sight and keeps the player's framing after that.
 */

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;

export function MapView({
  map,
  selectedTokenId,
  onSelectToken,
}: {
  map: ClientMap;
  selectedTokenId: string | null;
  onSelectToken(tokenId: string): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; moved: boolean } | null>(
    null,
  );
  const fittedFor = useRef<string | null>(null);

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

  const onPointerDown = (e: React.PointerEvent) => {
    box.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    gesture.current = {
      dist: pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0,
      mid: midpoint(pts),
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
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
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
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
          {map.tokens.map((t) => {
            const size = t.footprint * cell;
            return (
              <div
                key={t.id}
                className={`token-slot pc-token${t.mine ? ' mine' : ''}${t.fogged ? ' fogged' : ''}`}
                data-token-id={t.id}
                data-mine={t.mine}
                data-testid="pc-token"
                style={{
                  left: map.grid.offsetX + t.x * cell,
                  top: map.grid.offsetY + t.y * cell,
                  width: size,
                  height: size,
                }}
              >
                <TokenDisc
                  token={t}
                  style={map.tokenStyle}
                  size={size}
                  selected={t.id === selectedTokenId}
                />
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

function midpoint(pts: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (!pts.length) return { x: 0, y: 0 };
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}
