import { useLayoutEffect, useRef, useState } from 'react';
import type { CombatSummary, MapScene } from '@trifold/api';
import { TokenDisc } from './TokenDisc';
import { viewTransform } from './mapMath';

/** Grid lines as an SVG pattern over the map. */
export function GridLines({
  width,
  height,
  grid,
}: {
  width: number;
  height: number;
  grid: { cellPx: number; offsetX: number; offsetY: number; color: string; opacity: number };
}) {
  const id = `grid-${Math.round(grid.cellPx * 100)}-${Math.round(grid.offsetX)}-${Math.round(grid.offsetY)}`;
  return (
    <svg className="grid-lines" width={width} height={height} aria-hidden="true">
      <defs>
        <pattern
          id={id}
          width={grid.cellPx}
          height={grid.cellPx}
          patternUnits="userSpaceOnUse"
          x={grid.offsetX}
          y={grid.offsetY}
        >
          <path
            d={`M ${grid.cellPx} 0 L 0 0 0 ${grid.cellPx}`}
            fill="none"
            stroke={grid.color}
            strokeOpacity={grid.opacity}
            strokeWidth={Math.max(1, grid.cellPx / 60)}
          />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * The map as the TV shows it: the camera rectangle letterboxed into the window, tokens placed in
 * map pixels so a transform on the whole map moves everything at once.
 */
export function MapLayer({ scene, combat }: { scene: MapScene; combat: CombatSummary | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { scale, tx, ty } = viewTransform(scene.camera, viewport.width, viewport.height);
  const activeTokenId = combat?.entries.find((e) => e.id === combat.activeId)?.tokenId ?? null;
  const deadTokens = new Set(combat?.entries.filter((e) => e.dead).map((e) => e.tokenId) ?? []);
  const nameByToken = new Map(
    combat?.entries.filter((e) => e.tokenId).map((e) => [e.tokenId, e.name]) ?? [],
  );

  return (
    <div ref={ref} className={`map-viewport backdrop-${scene.backdrop}`} data-testid="map-layer">
      <div
        className="map-surface"
        style={{
          width: scene.width,
          height: scene.height,
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }}
      >
        {scene.imageUrl ? (
          <img
            className="map-image"
            src={scene.imageUrl}
            alt=""
            width={scene.width}
            height={scene.height}
            draggable={false}
          />
        ) : (
          <div
            className={`map-blank backdrop-${scene.backdrop}`}
            style={{ width: scene.width, height: scene.height }}
          />
        )}
        {scene.grid.visible && (
          <GridLines width={scene.width} height={scene.height} grid={scene.grid} />
        )}
        {scene.tokens.map((token) => {
          const size = token.footprint * scene.grid.cellPx;
          return (
            <div
              key={token.id}
              className="token-slot"
              data-testid="player-token"
              style={{
                left: scene.grid.offsetX + token.x * scene.grid.cellPx,
                top: scene.grid.offsetY + token.y * scene.grid.cellPx,
                width: size,
                height: size,
              }}
            >
              <TokenDisc
                token={{
                  ...token,
                  label: nameByToken.get(token.id) ?? token.label,
                  dead: token.dead || deadTokens.has(token.id),
                }}
                style={scene.tokenStyle}
                size={size}
                active={token.id === activeTokenId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
