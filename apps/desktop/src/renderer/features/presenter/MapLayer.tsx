import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CombatSummary, LiveArea, LiveRuler, MapScene } from '@trifold/api';
import type { FogShape } from '@trifold/schema';
import { svgPoints } from './fog';
import { rulerLabel } from './ruler';
import { TokenDisc } from './TokenDisc';
import { viewTransform } from './mapMath';

/**
 * The map as the players see it (DESIGN.md §6.5): art, grid lines and token discs placed in map
 * pixels, with the live camera letterboxed into the window. It is a pure view of the LiveScene
 * main pushes, so the player window and the console's preview render the same thing; the
 * console's editing lives in MapEditor, which borrows only `GridLines` from here.
 */

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
 * Fog of war (ADR 0029) as an SVG mask in map pixels: the fog is whole, then each shape in order
 * cuts it away (reveal) or paints it back (hide). The TV draws it opaque. The console's editor
 * passes `dm`: a light mist with dark diagonal hatching, so fogged areas read on dark maps and
 * light ones alike; `zoom` keeps the hatching the same size on screen at any DM zoom.
 */
export function FogLayer({
  width,
  height,
  shapes,
  dm = false,
  zoom = 1,
}: {
  width: number;
  height: number;
  shapes: readonly FogShape[];
  dm?: boolean;
  zoom?: number;
}) {
  const id = `fog-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={`fog-layer${dm ? ' dm' : ''}`}
      data-testid={dm ? 'fog-dm' : 'fog'}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect width={width} height={height} fill="white" />
          {shapes.map((s) => {
            const fill = s.mode === 'reveal' ? 'black' : 'white';
            if (s.kind === 'all')
              return <rect key={s.id} width={width} height={height} fill={fill} />;
            if (s.kind === 'rect')
              return <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} fill={fill} />;
            return <polygon key={s.id} points={svgPoints(s.points)} fill={fill} />;
          })}
        </mask>
      </defs>
      {dm && (
        <pattern
          id={`${id}-hatch`}
          width={14 / zoom}
          height={14 / zoom}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={14 / zoom}
            className="fog-hatch"
            strokeWidth={1.5 / zoom}
          />
        </pattern>
      )}
      <rect className="fog-fill" width={width} height={height} mask={`url(#${id})`} />
      {dm && <rect width={width} height={height} fill={`url(#${id}-hatch)`} mask={`url(#${id})`} />}
    </svg>
  );
}

/**
 * The movement ruler (Beta 9) in map pixels: a line between square centres, a dot at each end and
 * the reading beside the far end. `zoom` is how many screen pixels one map pixel takes, so the
 * line and the label keep their size on screen on either display.
 */
export function RulerLayer({
  width,
  height,
  from,
  to,
  squares,
  zoom,
}: {
  width: number;
  height: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  squares: number;
  zoom: number;
}) {
  const k = 1 / (zoom || 1);
  return (
    <>
      <svg className="ruler-layer" width={width} height={height} aria-hidden="true">
        <line className="ruler-casing" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <line className="ruler-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <circle className="ruler-end" cx={from.x} cy={from.y} r={5 * k} />
        <circle className="ruler-end" cx={to.x} cy={to.y} r={5 * k} />
      </svg>
      <div
        className="ruler-label"
        data-testid="ruler-label"
        style={{ left: to.x, top: to.y, transform: `scale(${k}) translate(14px, -50%)` }}
      >
        {rulerLabel(squares)}
      </div>
    </>
  );
}

/**
 * An area shape (ADR 0050) in map pixels: the squares it covers shaded, its outline over them and
 * its reading at the origin. Drawn under the fog on the TV and phones, so fogged squares stay
 * hidden; it selects nothing.
 */
export function AreaLayer({
  width,
  height,
  grid,
  area,
  zoom,
}: {
  width: number;
  height: number;
  grid: { cellPx: number; offsetX: number; offsetY: number };
  area: Pick<LiveArea, 'label' | 'outline' | 'squares'>;
  zoom: number;
}) {
  const k = 1 / (zoom || 1);
  const o = area.outline;
  const at = o.kind === 'circle' ? { x: o.cx, y: o.cy } : o.points[0]!;
  return (
    <>
      <svg className="area-layer" width={width} height={height} aria-hidden="true">
        {area.squares.map((c) => (
          <rect
            key={`${c.x},${c.y}`}
            className="area-square"
            x={grid.offsetX + c.x * grid.cellPx}
            y={grid.offsetY + c.y * grid.cellPx}
            width={grid.cellPx}
            height={grid.cellPx}
          />
        ))}
        {o.kind === 'circle' ? (
          <circle className="area-outline" cx={o.cx} cy={o.cy} r={o.r} />
        ) : (
          <polygon
            className="area-outline"
            points={o.points.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        )}
        <circle className="area-origin" cx={at.x} cy={at.y} r={4 * k} />
      </svg>
      <div
        className="ruler-label area-label"
        data-testid="area-label"
        style={{ left: at.x, top: at.y, transform: `scale(${k}) translate(-50%, -140%)` }}
      >
        {area.label}
      </div>
    </>
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
export function MapLayer({
  scene,
  combat,
  ruler = null,
  area = null,
}: {
  scene: MapScene;
  combat: CombatSummary | null;
  /** The DM's movement ruler on this map, when the players may see it (Beta 9). */
  ruler?: LiveRuler | null;
  /** The DM's area shape on this map (ADR 0050). */
  area?: LiveArea | null;
}) {
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
        {area && area.sceneId === scene.id && (
          <AreaLayer
            width={scene.width}
            height={scene.height}
            grid={scene.grid}
            area={area}
            zoom={scale}
          />
        )}
        {scene.fog && (
          <FogLayer width={scene.width} height={scene.height} shapes={scene.fog.shapes} />
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
        {ruler && ruler.sceneId === scene.id && (
          <RulerLayer
            width={scene.width}
            height={scene.height}
            from={ruler.from}
            to={ruler.to}
            squares={ruler.squares}
            zoom={scale}
          />
        )}
      </div>
    </div>
  );
}
