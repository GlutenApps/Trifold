import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ulid } from 'ulid';
import { mediaUrl, type CompendiumRow } from '@trifold/api';
import type { CombatantTemplate, Encounter, EntryMarker, Scene, Token } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useUiStore } from '../../stores/uiStore';
import { GridLines } from './MapLayer';
import { TokenDisc } from './TokenDisc';
import {
  DEFAULT_BLANK,
  DEFAULT_GRID,
  alignFromClicks,
  cameraRect,
  footprintForSize,
  mapSize,
  partyFormation,
  pixelToGrid,
  snap,
  type Point,
} from './mapMath';

type Mode = 'select' | 'align' | 'marker' | 'party' | 'place';

interface Pending {
  kind: 'creature' | 'marker';
  row?: CompendiumRow;
}

interface DmCamera {
  x: number;
  y: number;
  zoom: number;
}

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;

function nowIso() {
  return new Date().toISOString();
}

/**
 * The console side of a map or blank-grid scene (DESIGN.md §6.5): DM camera, grid alignment,
 * tokens with snap-to-grid drag, entry markers and party placement, the player camera and its
 * viewport rectangle, and "start combat" from the placed creatures.
 */
export function MapEditor({
  scene,
  slug,
  onChange,
}: {
  scene: Scene;
  slug: string;
  onChange(scene: Scene): void;
}) {
  const pcs = useCampaignStore((s) => s.current?.pcs ?? []);
  const encounters = useCampaignStore((s) => s.current?.encounters ?? []);
  const initiativeMode = useCampaignStore(
    (s) => s.current?.campaign.settings.initiativeMode ?? 'perGroup',
  );
  const saveEncounter = useCampaignStore((s) => s.saveEncounter);
  const importSceneImage = useCampaignStore((s) => s.importSceneImage);
  const combatState = useCombatStore((s) => s.state);
  const combatEncounterId = useCombatStore((s) => s.encounterId);
  const begin = useCombatStore((s) => s.begin);
  const resume = useCombatStore((s) => s.resume);
  const setSection = useUiStore((s) => s.setSection);
  const aspect = usePresenterStore((s) => s.liveOptions.aspect);
  const tokenStyle = usePresenterStore((s) => s.liveOptions.tokenStyle);

  const containerRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<DmCamera>({ x: 0, y: 0, zoom: 0.25 });
  const [mode, setMode] = useState<Mode>('select');
  const [pending, setPending] = useState<Pending | null>(null);
  const [alignFirst, setAlignFirst] = useState<Point | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);
  const drag = useRef<{ tokenId: string; dx: number; dy: number } | null>(null);
  const pan = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);
  const debounce = useRef<number | null>(null);

  const grid = scene.grid ?? DEFAULT_GRID;
  const size = mapSize(scene);
  const linkedEncounter = encounters.find((e) => e.id === scene.encounterId) ?? null;
  const activeCombatant =
    combatState && combatState.turnIndex >= 0
      ? combatState.combatants[combatState.turnIndex]
      : null;
  const activeTokenId = activeCombatant?.tokenId ?? null;
  const deadTokens = new Set(
    combatState?.combatants.filter((c) => c.dead && c.tokenId).map((c) => c.tokenId) ?? [],
  );
  const viewportRect = cameraRect(
    scene.playerCamera,
    size,
    grid,
    scene.tokens,
    aspect,
    activeTokenId,
  );
  const selectedToken = scene.tokens.find((t) => t.id === selectedTokenId) ?? null;

  // Fit the DM camera to the container whenever the scene (or its size) changes.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const zoom = Math.min(cw / size.width, ch / size.height) * 0.95;
      setCam({ x: (cw - size.width * zoom) / 2, y: (ch - size.height * zoom) / 2, zoom });
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scene.id, size.width, size.height]);

  // Creature search for placing tokens.
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    if (!query.trim()) {
      setRows([]);
      return;
    }
    debounce.current = window.setTimeout(() => {
      window.trifold.compendium
        .search({ kind: 'monster', text: query, limit: 8 })
        .then((r) => setRows(r.rows))
        .catch(() => setRows([]));
    }, 150);
  }, [query]);

  const patch = (p: Partial<Scene>) => onChange({ ...scene, ...p, updatedAt: nowIso() });
  const patchGrid = (p: Partial<Scene['grid'] & object>) => patch({ grid: { ...grid, ...p } });
  const patchToken = (id: string, p: Partial<Token>) =>
    patch({ tokens: scene.tokens.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const removeToken = (id: string) => {
    patch({ tokens: scene.tokens.filter((t) => t.id !== id) });
    if (selectedTokenId === id) setSelectedTokenId(null);
    setMenu(null);
  };

  const mapPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: (e.clientX - (rect?.left ?? 0) - cam.x) / cam.zoom,
      y: (e.clientY - (rect?.top ?? 0) - cam.y) / cam.zoom,
    };
  };

  const placeParty = (at: Point) => {
    const others = scene.tokens.filter((t) => t.kind !== 'pc');
    const spots = partyFormation(pcs.length, pixelToGrid(at.x, at.y, grid));
    const party: Token[] = pcs.map((pc, i) => ({
      id: ulid(),
      kind: 'pc',
      ref: { kind: 'pc', pcId: pc.id, name: pc.name },
      label: pc.name,
      x: spots[i]!.x,
      y: spots[i]!.y,
      footprint: 1,
      role: 'ally',
      hidden: false,
      nameMasked: false,
      dead: false,
    }));
    patch({ tokens: [...others, ...party] });
  };

  const placePending = (at: Point) => {
    if (!pending) return;
    const cell = snap(pixelToGrid(at.x, at.y, grid));
    const token: Token =
      pending.kind === 'marker' || !pending.row
        ? {
            id: ulid(),
            kind: 'marker',
            ref: { kind: 'custom', name: 'Marker' },
            label: 'Marker',
            x: cell.x,
            y: cell.y,
            footprint: 1,
            role: 'neutral',
            hidden: false,
            nameMasked: false,
            dead: false,
          }
        : {
            id: ulid(),
            kind: 'creature',
            ref: {
              kind: 'record',
              ref: {
                recordId: pending.row.id,
                sourceId: pending.row.sourceId,
                key: pending.row.key,
                edition: pending.row.edition as 'unknown',
              },
              name: pending.row.displayName,
            },
            label: pending.row.displayName,
            maskedLabel: pending.row.type ? capitalize(pending.row.type) : 'Creature',
            x: cell.x,
            y: cell.y,
            footprint: footprintForSize(pending.row.size),
            role: 'enemy',
            hidden: false,
            nameMasked: true,
            dead: false,
          };
    patch({ tokens: [...scene.tokens, token] });
    setSelectedTokenId(token.id);
  };

  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    setMenu(null);
    const at = mapPoint(e);
    if (mode === 'align') {
      if (!alignFirst) {
        setAlignFirst(at);
        return;
      }
      const derived = alignFromClicks(alignFirst, at);
      if (derived) patchGrid(derived);
      setAlignFirst(null);
      setMode('select');
      return;
    }
    if (mode === 'marker') {
      const cell = pixelToGrid(at.x, at.y, grid);
      const marker: EntryMarker = {
        id: ulid(),
        name: `Entry ${scene.entryMarkers.length + 1}`,
        x: Math.round(cell.x * 2) / 2,
        y: Math.round(cell.y * 2) / 2,
      };
      patch({ entryMarkers: [...scene.entryMarkers, marker] });
      setMode('select');
      return;
    }
    if (mode === 'party') {
      placeParty(at);
      setMode('select');
      return;
    }
    if (mode === 'place') {
      placePending(at);
      if (!e.shiftKey) {
        setPending(null);
        setMode('select');
      }
      return;
    }
    setSelectedTokenId(null);
    pan.current = { startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onBackgroundMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pan.current) {
      setCam({
        ...cam,
        x: pan.current.camX + (e.clientX - pan.current.startX),
        y: pan.current.camY + (e.clientY - pan.current.startY),
      });
    }
  };

  const onBackgroundUp = () => {
    pan.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const mx = e.clientX - (rect?.left ?? 0);
    const my = e.clientY - (rect?.top ?? 0);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom * factor));
    const ratio = zoom / cam.zoom;
    setCam({ zoom, x: mx - (mx - cam.x) * ratio, y: my - (my - cam.y) * ratio });
  };

  const onTokenDown = (e: ReactPointerEvent<HTMLDivElement>, token: Token) => {
    e.stopPropagation();
    if (e.button === 2) return;
    setMenu(null);
    setSelectedTokenId(token.id);
    if (mode !== 'select') return;
    const at = mapPoint(e);
    const cell = pixelToGrid(at.x, at.y, grid);
    drag.current = { tokenId: token.id, dx: cell.x - token.x, dy: cell.y - token.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTokenMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const at = mapPoint(e);
    const cell = pixelToGrid(at.x, at.y, grid);
    const raw = { x: cell.x - d.dx, y: cell.y - d.dy };
    const next = e.altKey
      ? { x: Math.round(raw.x * 4) / 4, y: Math.round(raw.y * 4) / 4 }
      : snap(raw);
    const token = scene.tokens.find((t) => t.id === d.tokenId);
    if (token && (token.x !== next.x || token.y !== next.y)) patchToken(d.tokenId, next);
  };

  const onTokenUp = () => {
    drag.current = null;
  };

  const onTokenContext = (e: React.MouseEvent<HTMLDivElement>, token: Token) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    setSelectedTokenId(token.id);
    setMenu({
      tokenId: token.id,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    });
  };

  const setArt = async (tokenId: string) => {
    const image = await importSceneImage();
    if (image) patchToken(tokenId, { art: image.displayPath });
    setMenu(null);
  };

  const useMyView = () => {
    const el = containerRef.current;
    if (!el) return;
    const centre = mapPoint({
      clientX: el.getBoundingClientRect().left + el.clientWidth / 2,
      clientY: el.getBoundingClientRect().top + el.clientHeight / 2,
    });
    const visibleWidth = el.clientWidth / cam.zoom;
    patch({
      playerCamera: { mode: 'manual', x: centre.x, y: centre.y, zoom: size.width / visibleWidth },
    });
  };

  const startCombat = async () => {
    if (linkedEncounter) {
      if (combatEncounterId === linkedEncounter.id) {
        setSection('encounters');
        return;
      }
      if (linkedEncounter.state) await resume(linkedEncounter);
      else await begin(linkedEncounter, pcs, initiativeMode);
      setSection('encounters');
      return;
    }
    const creatures = scene.tokens.filter((t) => t.kind === 'creature');
    const templates: CombatantTemplate[] = [];
    for (const token of creatures) {
      let cache: CombatantTemplate['cache'];
      if (token.ref.kind === 'record') {
        const record = await window.trifold.compendium.get(token.ref.ref.recordId);
        if (record?.kind === 'monster') {
          cache = {
            xp: record.data.xp,
            cr: record.data.cr,
            type: record.data.type,
            hp: record.data.hp?.average ?? 0,
            ac: record.data.ac?.value ?? 10,
          };
        }
      }
      templates.push({
        id: ulid(),
        ref: token.ref,
        label: token.label,
        quantity: 1,
        role: token.role,
        hidden: token.hidden,
        tokenId: token.id,
        ...(cache ? { cache } : {}),
      });
    }
    for (const pc of pcs) {
      const token = scene.tokens.find(
        (t) => t.kind === 'pc' && t.ref.kind === 'pc' && t.ref.pcId === pc.id,
      );
      templates.push({
        id: ulid(),
        ref: { kind: 'pc', pcId: pc.id, name: pc.name },
        quantity: 1,
        role: 'ally',
        hidden: false,
        ...(token ? { tokenId: token.id } : {}),
      });
    }
    const encounter: Encounter = {
      schemaVersion: 1,
      id: ulid(),
      name: scene.title,
      sceneId: scene.id,
      combatants: templates,
      notes: '',
      state: null,
      results: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const saved = await saveEncounter(encounter);
    if (!saved) return;
    patch({ encounterId: saved.id });
    await begin(saved, pcs, initiativeMode);
    setSection('encounters');
  };

  const cursor =
    mode === 'select'
      ? pan.current
        ? 'grabbing'
        : 'grab'
      : mode === 'align'
        ? 'crosshair'
        : 'copy';

  return (
    <div className="map-editor">
      <div className="row map-toolbar">
        <button
          type="button"
          className="btn tiny"
          aria-pressed={mode === 'select'}
          onClick={() => setMode('select')}
        >
          Select
        </button>
        <button
          type="button"
          className="btn tiny"
          aria-pressed={mode === 'align'}
          onClick={() => {
            setAlignFirst(null);
            setMode(mode === 'align' ? 'select' : 'align');
          }}
          title="Click two opposite corners of one cell"
        >
          Align grid
        </button>
        <button
          type="button"
          className="btn tiny"
          aria-pressed={mode === 'marker'}
          onClick={() => setMode(mode === 'marker' ? 'select' : 'marker')}
        >
          Add entry marker
        </button>
        <button
          type="button"
          className="btn tiny"
          aria-pressed={mode === 'party'}
          disabled={pcs.length === 0}
          onClick={() => setMode(mode === 'party' ? 'select' : 'party')}
          title="Click the map (or an entry marker) to drop the party there"
        >
          Place party
        </button>
        <button
          type="button"
          className="btn tiny"
          aria-pressed={mode === 'place' && pending?.kind === 'marker'}
          onClick={() => {
            setPending({ kind: 'marker' });
            setMode('place');
          }}
        >
          Add marker token
        </button>
        <span className="spacer" />
        <span className="muted small">
          {mode === 'align'
            ? alignFirst
              ? 'Now click the opposite corner of that cell'
              : 'Click one corner of a cell'
            : mode === 'party'
              ? 'Click where the party enters'
              : mode === 'marker'
                ? 'Click to drop an entry marker'
                : mode === 'place'
                  ? `Click to place ${pending?.row?.displayName ?? 'a marker'} (Shift keeps placing)`
                  : 'Drag tokens; Alt for free placement; wheel to zoom'}
        </span>
      </div>

      <div
        ref={containerRef}
        className="map-canvas"
        data-testid="map-canvas"
        style={{ cursor }}
        tabIndex={0}
        onPointerDown={onBackgroundDown}
        onPointerMove={onBackgroundMove}
        onPointerUp={onBackgroundUp}
        onPointerCancel={onBackgroundUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setMode('select');
            setPending(null);
            setMenu(null);
          }
          if (e.key === 'Delete' && selectedTokenId) removeToken(selectedTokenId);
        }}
      >
        <div
          className="map-surface"
          style={{
            width: size.width,
            height: size.height,
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`,
          }}
        >
          {scene.image ? (
            <img
              className="map-image"
              src={mediaUrl(slug, scene.image.displayPath)}
              alt=""
              width={size.width}
              height={size.height}
              draggable={false}
            />
          ) : (
            <div
              className={`map-blank backdrop-${scene.backdrop ?? 'parchment'}`}
              style={{ width: size.width, height: size.height }}
            />
          )}
          <GridLines width={size.width} height={size.height} grid={grid} />
          {alignFirst && (
            <div className="align-dot" style={{ left: alignFirst.x, top: alignFirst.y }} />
          )}
          <div
            className="player-viewport"
            data-testid="player-viewport"
            style={{
              left: viewportRect.x,
              top: viewportRect.y,
              width: viewportRect.width,
              height: viewportRect.height,
              borderWidth: Math.max(2, 3 / cam.zoom),
            }}
          />
          {scene.entryMarkers.map((m) => (
            <button
              type="button"
              key={m.id}
              className="entry-marker"
              data-testid="entry-marker"
              title={`Place the party at ${m.name}`}
              style={{
                left: grid.offsetX + m.x * grid.cellPx,
                top: grid.offsetY + m.y * grid.cellPx,
                fontSize: grid.cellPx * 0.3,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (pcs.length)
                  placeParty({
                    x: grid.offsetX + m.x * grid.cellPx,
                    y: grid.offsetY + m.y * grid.cellPx,
                  });
                setMode('select');
              }}
            >
              {m.name}
            </button>
          ))}
          {scene.tokens.map((token) => {
            const px = token.footprint * grid.cellPx;
            return (
              <div
                key={token.id}
                className="token-slot"
                data-testid="console-token"
                style={{
                  left: grid.offsetX + token.x * grid.cellPx,
                  top: grid.offsetY + token.y * grid.cellPx,
                  width: px,
                  height: px,
                }}
                onPointerDown={(e) => onTokenDown(e, token)}
                onPointerMove={onTokenMove}
                onPointerUp={onTokenUp}
                onPointerCancel={onTokenUp}
                onContextMenu={(e) => onTokenContext(e, token)}
              >
                <TokenDisc
                  token={{
                    ...token,
                    artUrl: token.art ? mediaUrl(slug, token.art) : undefined,
                    dead: token.dead || deadTokens.has(token.id),
                  }}
                  style={tokenStyle}
                  size={px}
                  active={token.id === activeTokenId}
                  selected={token.id === selectedTokenId}
                  hidden={token.hidden}
                />
              </div>
            );
          })}
        </div>

        {menu && (
          <div
            className="context-menu"
            role="menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(() => {
              const t = scene.tokens.find((x) => x.id === menu.tokenId);
              if (!t) return null;
              return (
                <>
                  {t.kind === 'creature' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        patchToken(t.id, { nameMasked: !t.nameMasked });
                        setMenu(null);
                      }}
                    >
                      {t.nameMasked ? 'Reveal name' : 'Mask name'}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      patchToken(t.id, { hidden: !t.hidden });
                      setMenu(null);
                    }}
                  >
                    {t.hidden ? 'Show to players' : 'Hide from players'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      patchToken(t.id, { dead: !t.dead });
                      setMenu(null);
                    }}
                  >
                    {t.dead ? 'Mark alive' : 'Mark dead'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => void setArt(t.id)}>
                    Set art…
                  </button>
                  <button type="button" role="menuitem" onClick={() => removeToken(t.id)}>
                    Remove
                  </button>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <div className="map-side">
        <div className="map-group">
          <h3>Player camera</h3>
          <div className="row">
            {(
              [
                ['fitMap', 'Fit map'],
                ['fitTokens', 'Fit tokens'],
                ['follow', 'Follow active'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className="btn tiny"
                aria-pressed={scene.playerCamera.mode === m}
                onClick={() => patch({ playerCamera: { ...scene.playerCamera, mode: m } })}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="btn tiny"
              aria-pressed={scene.playerCamera.mode === 'manual'}
              onClick={useMyView}
              title="Show the players what you see now"
            >
              Use my view
            </button>
          </div>
        </div>

        <div className="map-group">
          <h3>Grid</h3>
          <div className="row">
            <label className="field inline">
              Cell px
              <input
                type="number"
                className="narrow"
                min={4}
                step={0.5}
                value={grid.cellPx}
                onChange={(e) => patchGrid({ cellPx: Math.max(4, Number(e.target.value) || 70) })}
              />
            </label>
            <label className="field inline">
              Offset x
              <input
                type="number"
                className="narrow"
                value={grid.offsetX}
                onChange={(e) => patchGrid({ offsetX: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field inline">
              Offset y
              <input
                type="number"
                className="narrow"
                value={grid.offsetY}
                onChange={(e) => patchGrid({ offsetY: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field inline">
              Colour
              <input
                type="color"
                value={grid.color}
                onChange={(e) => patchGrid({ color: e.target.value })}
              />
            </label>
            <label className="field inline">
              Opacity
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={grid.opacity}
                onChange={(e) => patchGrid({ opacity: Number(e.target.value) })}
              />
            </label>
            <label className="field inline">
              <input
                type="checkbox"
                checked={grid.showToPlayers}
                onChange={(e) => patchGrid({ showToPlayers: e.target.checked })}
              />
              Show to players
            </label>
          </div>
          {scene.kind === 'blankGrid' && (
            <div className="row">
              <label className="field inline">
                Columns
                <input
                  type="number"
                  className="narrow"
                  min={1}
                  max={200}
                  value={(scene.blank ?? DEFAULT_BLANK).cols}
                  onChange={(e) =>
                    patch({
                      blank: {
                        ...(scene.blank ?? DEFAULT_BLANK),
                        cols: Math.max(1, Number(e.target.value) || 1),
                      },
                    })
                  }
                />
              </label>
              <label className="field inline">
                Rows
                <input
                  type="number"
                  className="narrow"
                  min={1}
                  max={200}
                  value={(scene.blank ?? DEFAULT_BLANK).rows}
                  onChange={(e) =>
                    patch({
                      blank: {
                        ...(scene.blank ?? DEFAULT_BLANK),
                        rows: Math.max(1, Number(e.target.value) || 1),
                      },
                    })
                  }
                />
              </label>
              <label className="field inline">
                Backdrop
                <select
                  value={scene.backdrop ?? 'parchment'}
                  onChange={(e) => patch({ backdrop: e.target.value as Scene['backdrop'] })}
                >
                  <option value="parchment">Parchment</option>
                  <option value="stone">Stone</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="map-group">
          <h3>Creatures</h3>
          <input
            type="text"
            aria-label="Find creature to place"
            placeholder="Find a creature to place…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {rows.length > 0 && (
            <ul className="picker-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <span>
                    {row.displayName}{' '}
                    <span className="muted small">{row.cr ? `CR ${row.cr}` : ''}</span>
                  </span>
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => {
                      setPending({ kind: 'creature', row });
                      setMode('place');
                      containerRef.current?.focus();
                    }}
                  >
                    Place
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={() => void startCombat()}
              disabled={!linkedEncounter && scene.tokens.every((t) => t.kind !== 'creature')}
            >
              {linkedEncounter
                ? combatEncounterId === linkedEncounter.id
                  ? 'Go to combat'
                  : linkedEncounter.state
                    ? 'Resume linked combat'
                    : 'Start linked encounter'
                : 'Start combat from tokens'}
            </button>
            {linkedEncounter && (
              <button
                type="button"
                className="btn tiny"
                onClick={() => patch({ encounterId: undefined })}
                title="Forget the linked encounter so a new one is built from the tokens"
              >
                Unlink
              </button>
            )}
            {scene.tokens.some((t) => t.kind === 'pc') && (
              <button
                type="button"
                className="btn tiny"
                onClick={() => patch({ tokens: scene.tokens.filter((t) => t.kind !== 'pc') })}
              >
                Remove party
              </button>
            )}
          </div>
        </div>

        {selectedToken && (
          <div className="map-group" data-testid="token-inspector">
            <h3>Token</h3>
            <div className="row">
              <label className="field inline">
                Label
                <input
                  type="text"
                  value={selectedToken.label}
                  onChange={(e) => patchToken(selectedToken.id, { label: e.target.value })}
                />
              </label>
              <label className="field inline">
                Role
                <select
                  value={selectedToken.role}
                  onChange={(e) =>
                    patchToken(selectedToken.id, { role: e.target.value as Token['role'] })
                  }
                >
                  <option value="enemy">Enemy</option>
                  <option value="ally">Ally</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label className="field inline">
                Size
                <select
                  value={selectedToken.footprint}
                  onChange={(e) =>
                    patchToken(selectedToken.id, {
                      footprint: Number(e.target.value) as Token['footprint'],
                    })
                  }
                >
                  <option value={1}>1 cell</option>
                  <option value={2}>2 cells</option>
                  <option value={3}>3 cells</option>
                  <option value={4}>4 cells</option>
                </select>
              </label>
            </div>
            <div className="row">
              {selectedToken.kind === 'creature' && (
                <label className="field inline">
                  <input
                    type="checkbox"
                    checked={selectedToken.nameMasked}
                    onChange={(e) => patchToken(selectedToken.id, { nameMasked: e.target.checked })}
                  />
                  Mask name on TV
                </label>
              )}
              <label className="field inline">
                <input
                  type="checkbox"
                  checked={selectedToken.hidden}
                  onChange={(e) => patchToken(selectedToken.id, { hidden: e.target.checked })}
                />
                Hidden from players
              </label>
              <label className="field inline">
                <input
                  type="checkbox"
                  checked={selectedToken.dead}
                  onChange={(e) => patchToken(selectedToken.id, { dead: e.target.checked })}
                />
                Dead
              </label>
              <button
                type="button"
                className="btn tiny"
                onClick={() => void setArt(selectedToken.id)}
              >
                Set art…
              </button>
              <button
                type="button"
                className="btn tiny"
                onClick={() => removeToken(selectedToken.id)}
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {scene.entryMarkers.length > 0 && (
          <div className="map-group">
            <h3>Entry markers</h3>
            <ul className="picker-list">
              {scene.entryMarkers.map((m) => (
                <li key={m.id}>
                  <input
                    type="text"
                    aria-label="Entry marker name"
                    value={m.name}
                    onChange={(e) =>
                      patch({
                        entryMarkers: scene.entryMarkers.map((x) =>
                          x.id === m.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() =>
                      patch({ entryMarkers: scene.entryMarkers.filter((x) => x.id !== m.id) })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
