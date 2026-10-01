import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const FADE_MS = 900;

/**
 * A map's art. A new background on the same scene fades in over the old one once it has loaded
 * (keyed by scene, so a different scene cuts straight to its own art).
 */
function MapArt({ url, width, height }: { url: string; width: number; height: number }) {
  const [shown, setShown] = useState(url);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const incoming = url !== shown ? url : null;
  const ready = incoming !== null && readyUrl === incoming;

  // transitionend is the usual finish; the timer covers a window that never paints it.
  useEffect(() => {
    if (!ready || !incoming) return;
    const timer = window.setTimeout(() => setShown(incoming), FADE_MS + 200);
    return () => window.clearTimeout(timer);
  }, [ready, incoming]);

  return (
    <>
      <img
        className="map-image"
        src={shown}
        alt=""
        width={width}
        height={height}
        draggable={false}
      />
      {incoming && (
        <img
          key={incoming}
          className={`map-image incoming${ready ? ' ready' : ''}`}
          data-testid="map-image-incoming"
          src={incoming}
          alt=""
          width={width}
          height={height}
          draggable={false}
          onLoad={() => requestAnimationFrame(() => setReadyUrl(incoming))}
          onTransitionEnd={() => setShown(incoming)}
        />
      )}
    </>
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

  // Camera moves glide, but a new scene must land in place: enable the transition only after the
  // first measured transform has painted, or it animates in from the top-left corner.
  const [settled, setSettled] = useState(false);
  const measured = viewport.width > 0 && viewport.height > 0;
  useEffect(() => {
    if (!measured || settled) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSettled(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [measured, settled]);

  const { scale, tx, ty } = viewTransform(scene.camera, viewport.width, viewport.height);
  const activeTokenId = combat?.entries.find((e) => e.id === combat.activeId)?.tokenId ?? null;
  const deadTokens = new Set(combat?.entries.filter((e) => e.dead).map((e) => e.tokenId) ?? []);
  const nameByToken = new Map(
    combat?.entries.filter((e) => e.tokenId).map((e) => [e.tokenId, e.name]) ?? [],
  );

  return (
    <div ref={ref} className={`map-viewport backdrop-${scene.backdrop}`} data-testid="map-layer">
      <div
        className={`map-surface${settled ? ' settled' : ''}`}
        style={{
          width: scene.width,
          height: scene.height,
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }}
      >
        {scene.imageUrl ? (
          <MapArt key={scene.id} url={scene.imageUrl} width={scene.width} height={scene.height} />
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
