import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ulid } from 'ulid';
import { mediaUrl, type CompendiumRow } from '@trifold/api';
import { numberedNames } from '@trifold/rules';
import type {
  CombatantTemplate,
  Encounter,
  EntryMarker,
  PCCard,
  Scene,
  Token,
} from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useIconStore } from '../../stores/iconStore';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from '../shell/icons';
import { GridLines } from './MapLayer';
import { TokenDisc } from './TokenDisc';
import {
  DEFAULT_BLANK,
  DEFAULT_GRID,
  activeBackgroundOf,
  addBackground,
  alignFromClicks,
  backgroundsOf,
  removeBackground,
  renameBackground,
  replaceBackgroundImage,
  sameShape,
  showBackground,
  cameraRect,
  encounterFormation,
  footprintForSize,
  mapSize,
  partyFormation,
  pixelToGrid,
  snap,
  type Point,
} from './mapMath';

type Mode = 'select' | 'align' | 'marker' | 'party' | 'place';

type Pending =
  { kind: 'creature'; row: CompendiumRow } | { kind: 'marker' } | { kind: 'pc'; pc: PCCard };

/** What the panel under the map is showing options for. */
type Selection = { kind: 'token'; id: string } | { kind: 'entry'; id: string } | null;

/** The tool strip's and action bar's pop-ups; one open at a time. */
type Pop = 'grid' | 'backgrounds' | 'camera' | 'party' | 'creature' | 'encounter';

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
  const openMajor = useShellStore((s) => s.openMajor);
  const glyphFor = useIconStore((s) => s.glyphForCreature);
  const loadIcons = useIconStore((s) => s.load);
  const aspect = usePresenterStore((s) => s.liveOptions.aspect);
  const tokenStyle = usePresenterStore((s) => s.liveOptions.tokenStyle);

  const containerRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<DmCamera>({ x: 0, y: 0, zoom: 0.25 });
  const [mode, setMode] = useState<Mode>('select');
  const [pending, setPending] = useState<Pending | null>(null);
  const [alignFirst, setAlignFirst] = useState<Point | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [menu, setMenu] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);
  const [pop, setPop] = useState<Pop | null>(null);
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
  const selectedTokenId = selection?.kind === 'token' ? selection.id : null;
  const selectedToken = scene.tokens.find((t) => t.id === selectedTokenId) ?? null;
  const selectedEntry =
    selection?.kind === 'entry'
      ? (scene.entryMarkers.find((m) => m.id === selection.id) ?? null)
      : null;
  const selectToken = (id: string) => setSelection({ kind: 'token', id });
  const togglePop = (p: Pop) => setPop(pop === p ? null : p);
  const closePop = () => setPop(null);

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

  useEffect(() => {
    void loadIcons();
  }, [loadIcons]);

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

  const commit = (next: Scene) => onChange({ ...next, updatedAt: nowIso() });
  const patch = (p: Partial<Scene>) => commit({ ...scene, ...p });
  const backgrounds = backgroundsOf(scene);
  const activeBackground = activeBackgroundOf(scene);
  const addBackgroundFile = async () => {
    const image = await importSceneImage();
    if (!image) return;
    const name = `Background ${backgrounds.length + 1}`;
    commit(addBackground(scene, { id: ulid(), name, image }));
  };
  const replaceBackgroundFile = async (id: string) => {
    const image = await importSceneImage();
    if (image) commit(replaceBackgroundImage(scene, id, image));
  };
  const patchGrid = (p: Partial<Scene['grid'] & object>) => patch({ grid: { ...grid, ...p } });
  const patchToken = (id: string, p: Partial<Token>) =>
    patch({ tokens: scene.tokens.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const removeToken = (id: string) => {
    patch({ tokens: scene.tokens.filter((t) => t.id !== id) });
    if (selectedTokenId === id) setSelection(null);
    setMenu(null);
  };
  const patchEntry = (id: string, p: Partial<EntryMarker>) =>
    patch({ entryMarkers: scene.entryMarkers.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const removeEntry = (id: string) => {
    patch({ entryMarkers: scene.entryMarkers.filter((m) => m.id !== id) });
    setSelection(null);
  };
  const entryPoint = (m: EntryMarker): Point => ({
    x: grid.offsetX + m.x * grid.cellPx,
    y: grid.offsetY + m.y * grid.cellPx,
  });

  const mapPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: (e.clientX - (rect?.left ?? 0) - cam.x) / cam.zoom,
      y: (e.clientY - (rect?.top ?? 0) - cam.y) / cam.zoom,
    };
  };

  const pcToken = (pc: PCCard, at: Point): Token => ({
    id: ulid(),
    kind: 'pc',
    ref: { kind: 'pc', pcId: pc.id, name: pc.name },
    label: pc.name,
    x: at.x,
    y: at.y,
    footprint: 1,
    role: 'ally',
    hidden: false,
    nameMasked: false,
    dead: false,
  });

  const placeParty = (at: Point) => {
    const others = scene.tokens.filter((t) => t.kind !== 'pc');
    const spots = partyFormation(pcs.length, pixelToGrid(at.x, at.y, grid));
    patch({ tokens: [...others, ...pcs.map((pc, i) => pcToken(pc, spots[i]!))] });
  };

  const placePending = (at: Point) => {
    if (!pending) return;
    const cell = snap(pixelToGrid(at.x, at.y, grid));
    if (pending.kind === 'pc') {
      // One token per PC: placing a PC again moves them.
      const token = pcToken(pending.pc, cell);
      const others = scene.tokens.filter(
        (t) => !(t.kind === 'pc' && t.ref.kind === 'pc' && t.ref.pcId === pending.pc.id),
      );
      patch({ tokens: [...others, token] });
      selectToken(token.id);
      return;
    }
    const markerGlyph = glyphFor({ name: 'marker' }, 'marker');
    const creatureGlyph =
      pending.kind === 'creature'
        ? glyphFor({ name: pending.row.displayName, type: pending.row.type }, 'creature')
        : null;
    const token: Token =
      pending.kind === 'marker'
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
            ...(markerGlyph ? { glyph: markerGlyph } : {}),
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
            ...(creatureGlyph ? { glyph: creatureGlyph } : {}),
          };
    patch({ tokens: [...scene.tokens, token] });
    selectToken(token.id);
  };

  /** A click on the map (or an entry marker) while a placing mode is on. */
  const placeAt = (at: Point, keepPlacing: boolean) => {
    if (mode === 'party') {
      placeParty(at);
      setMode('select');
      return;
    }
    placePending(at);
    if (!keepPlacing || pending?.kind === 'pc') {
      setPending(null);
      setMode('select');
    }
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
      setSelection({ kind: 'entry', id: marker.id });
      setMode('select');
      return;
    }
    if (mode === 'party' || mode === 'place') {
      placeAt(at, e.shiftKey);
      return;
    }
    setSelection(null);
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
    selectToken(token.id);
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
    selectToken(token.id);
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

  /** A combat template for a creature token on this map, with its record's cached values. */
  const templateFromToken = async (token: Token): Promise<CombatantTemplate> => {
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
    return {
      id: ulid(),
      ref: token.ref,
      label: token.label,
      quantity: 1,
      role: token.role,
      hidden: token.hidden,
      tokenId: token.id,
      ...(cache ? { cache } : {}),
    };
  };

  const pcTokenId = (pcId: string) =>
    scene.tokens.find((t) => t.kind === 'pc' && t.ref.kind === 'pc' && t.ref.pcId === pcId)?.id;

  const startCombat = async () => {
    if (linkedEncounter) {
      if (combatEncounterId === linkedEncounter.id) {
        openMajor('encounters', { avoid: 'map' });
        return;
      }
      if (linkedEncounter.state) {
        await resume(linkedEncounter);
        openMajor('encounters', { avoid: 'map' });
        return;
      }
      // Creatures dropped on the map besides the linked ones join the fight; PCs find their tokens.
      const linked = new Set(
        linkedEncounter.combatants.flatMap((t) => t.tokenIds ?? (t.tokenId ? [t.tokenId] : [])),
      );
      const loose = scene.tokens.filter((t) => t.kind === 'creature' && !linked.has(t.id));
      const combatants = linkedEncounter.combatants.map((t) => {
        if (t.ref.kind !== 'pc' || t.tokenId) return t;
        const tokenId = pcTokenId(t.ref.pcId);
        return tokenId ? { ...t, tokenId } : t;
      });
      combatants.push(...(await Promise.all(loose.map(templateFromToken))));
      const saved = await saveEncounter({ ...linkedEncounter, combatants, updatedAt: nowIso() });
      if (!saved) return;
      await begin(saved, pcs, initiativeMode);
      openMajor('encounters', { avoid: 'map' });
      return;
    }
    const creatures = scene.tokens.filter((t) => t.kind === 'creature');
    const templates: CombatantTemplate[] = await Promise.all(creatures.map(templateFromToken));
    for (const pc of pcs) {
      const tokenId = pcTokenId(pc.id);
      templates.push({
        id: ulid(),
        ref: { kind: 'pc', pcId: pc.id, name: pc.name },
        quantity: 1,
        role: 'ally',
        hidden: false,
        ...(tokenId ? { tokenId } : {}),
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
    openMajor('encounters', { avoid: 'map' });
  };

  /**
   * Drops a built encounter's creatures on the map, hidden from the players, near the middle of
   * the DM's view, and links the encounter to the scene so Start combat runs it (ADR 0005).
   * Creatures already placed here keep their tokens; PCs use the party's own tokens.
   */
  const placeEncounter = async (encounter: Encounter) => {
    closePop();
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const middle = mapPoint({
      clientX: (rect?.left ?? 0) + (el?.clientWidth ?? 0) / 2,
      clientY: (rect?.top ?? 0) + (el?.clientHeight ?? 0) / 2,
    });
    const centre = pixelToGrid(middle.x, middle.y, grid);
    const onMap = new Set(scene.tokens.map((t) => t.id));
    const added: Token[] = [];
    const combatants: CombatantTemplate[] = [];
    for (const template of encounter.combatants) {
      if (template.ref.kind === 'pc') {
        combatants.push(template);
        continue;
      }
      let size: string | null | undefined;
      let type = template.cache?.type;
      if (template.ref.kind === 'record') {
        const record = await window.trifold.compendium.get(template.ref.ref.recordId);
        if (record?.kind === 'monster') {
          size = record.data.size;
          type = record.data.type || type;
        }
      }
      const glyph = glyphFor({ name: template.ref.name, ...(type ? { type } : {}) }, 'creature');
      const had = template.tokenIds ?? (template.tokenId ? [template.tokenId] : []);
      const names = numberedNames(template.label || template.ref.name, template.quantity);
      const tokenIds = names.map((label, i) => {
        const kept = had[i];
        if (kept && onMap.has(kept)) return kept;
        const token: Token = {
          id: ulid(),
          kind: 'creature',
          ref: template.ref,
          label,
          maskedLabel: type ? capitalize(type) : 'Creature',
          x: 0,
          y: 0,
          footprint: footprintForSize(size),
          role: template.role,
          hidden: true,
          nameMasked: true,
          dead: false,
          ...(glyph ? { glyph } : {}),
        };
        added.push(token);
        return token.id;
      });
      const { tokenId: _single, ...rest } = template;
      combatants.push({ ...rest, tokenIds });
    }
    const spots = encounterFormation(
      added.map((t) => t.footprint),
      centre,
    );
    const placed = added.map((t, i) => ({ ...t, ...spots[i] }));
    const saved = await saveEncounter({
      ...encounter,
      sceneId: scene.id,
      combatants,
      updatedAt: nowIso(),
    });
    if (!saved) return;
    patch({ tokens: [...scene.tokens, ...placed], encounterId: saved.id });
  };

  const hiddenCreatures = scene.tokens.filter((t) => t.kind === 'creature' && t.hidden);
  const placeable = encounters.filter((e) => !e.state && e.id !== combatEncounterId);

  const cursor =
    mode === 'select'
      ? pan.current
        ? 'grabbing'
        : 'grab'
      : mode === 'align'
        ? 'crosshair'
        : 'copy';

  const hint =
    mode === 'align'
      ? alignFirst
        ? 'Now click the opposite corner of that cell'
        : 'Click one corner of a cell'
      : mode === 'party'
        ? 'Click the map or an entry marker to place the party'
        : mode === 'marker'
          ? 'Click the map to drop an entry marker'
          : mode === 'place'
            ? pending?.kind === 'pc'
              ? `Click to place ${pending.pc.name}`
              : `Click to place ${pending?.kind === 'creature' ? pending.row.displayName : 'a marker'} (Shift keeps placing)`
            : null;

  const cancelMode = () => {
    setMode('select');
    setPending(null);
    setAlignFirst(null);
  };
  /** Starts a placing mode from a pop-up and hands the keyboard to the map. */
  const beginPlacing = (next: Mode, p: Pending | null = null) => {
    setPending(p);
    setMode(next);
    closePop();
    containerRef.current?.focus();
  };

  return (
    <div className="map-editor">
      <div className="map-toolbar" role="toolbar" aria-label="Map tools">
        <button
          type="button"
          className={`chrome-btn${mode === 'select' ? ' on' : ''}`}
          aria-pressed={mode === 'select'}
          aria-label="Move"
          title="Move: drag tokens, drag the map to pan"
          onClick={() => {
            cancelMode();
            closePop();
          }}
        >
          <Icon name="hand" size={16} />
        </button>

        <MapPop
          open={pop === 'grid'}
          onClose={closePop}
          label="Grid settings"
          side="right"
          trigger={
            <button
              type="button"
              className={`chrome-btn${pop === 'grid' || mode === 'align' ? ' on' : ''}`}
              aria-label="Grid"
              aria-haspopup="dialog"
              aria-expanded={pop === 'grid'}
              title="Grid: align it to the map, cell size, colour"
              onClick={() => togglePop('grid')}
            >
              <Icon name="grid" size={16} />
            </button>
          }
        >
          <h3>Grid</h3>
          <button
            type="button"
            className="btn small"
            title="Click two opposite corners of one cell on the map"
            onClick={() => {
              setAlignFirst(null);
              beginPlacing('align');
            }}
          >
            Align grid to map
          </button>
          <div className="map-pop-fields">
            <label className="field">
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
            <label className="field">
              Offset x
              <input
                type="number"
                className="narrow"
                value={grid.offsetX}
                onChange={(e) => patchGrid({ offsetX: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              Offset y
              <input
                type="number"
                className="narrow"
                value={grid.offsetY}
                onChange={(e) => patchGrid({ offsetY: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              Colour
              <input
                type="color"
                value={grid.color}
                onChange={(e) => patchGrid({ color: e.target.value })}
              />
            </label>
            <label className="field">
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
            <div className="map-pop-fields">
              <label className="field">
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
              <label className="field">
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
              <label className="field">
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
        </MapPop>

        {scene.kind === 'map' && (
          <MapPop
            open={pop === 'backgrounds'}
            onClose={closePop}
            label="Backgrounds"
            side="right"
            trigger={
              <button
                type="button"
                className={`chrome-btn${pop === 'backgrounds' ? ' on' : ''}`}
                aria-label="Backgrounds"
                aria-haspopup="dialog"
                aria-expanded={pop === 'backgrounds'}
                title="Backgrounds: switch the map's art (day, night…) and keep tokens and grid"
                onClick={() => togglePop('backgrounds')}
              >
                <Icon name="image" size={16} />
              </button>
            }
          >
            <h3>Backgrounds</h3>
            <ul className="picker-list bg-list">
              {backgrounds.map((b, i) => {
                const showing = b.id === activeBackground?.id;
                return (
                  <li key={b.id} className={showing ? 'showing' : undefined}>
                    <img
                      className="bg-thumb"
                      src={mediaUrl(slug, b.image.displayPath)}
                      alt=""
                      draggable={false}
                    />
                    <input
                      type="text"
                      aria-label={`Background ${i + 1} name`}
                      value={b.name}
                      onChange={(e) => commit(renameBackground(scene, b.id, e.target.value))}
                    />
                    <button
                      type="button"
                      className="btn tiny"
                      disabled={showing}
                      aria-label={`${showing ? 'Showing' : 'Show'} ${b.name}`}
                      onClick={() => commit(showBackground(scene, b.id))}
                    >
                      {showing ? 'Showing' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="chrome-btn xs"
                      aria-label={`Replace ${b.name} image`}
                      title="Replace image…: pick a new file, keep the name"
                      onClick={() => void replaceBackgroundFile(b.id)}
                    >
                      <Icon name="folder" size={12} />
                    </button>
                    <button
                      type="button"
                      className="chrome-btn xs danger"
                      aria-label={`Remove ${b.name}`}
                      title="Remove this background (the image stays in the campaign folder)"
                      disabled={backgrounds.length < 2}
                      onClick={() => commit(removeBackground(scene, b.id))}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {activeBackground &&
              backgrounds.some((b) => !sameShape(b.image, activeBackground.image)) && (
                <p className="muted small">
                  Some art has a different shape; check the grid after switching.
                </p>
              )}
            <button type="button" className="btn small" onClick={() => void addBackgroundFile()}>
              Add background…
            </button>
            <p className="muted small">
              Tokens, grid and entry markers stay put; the TV crossfades.
            </p>
          </MapPop>
        )}

        <MapPop
          open={pop === 'camera'}
          onClose={closePop}
          label="Player camera"
          side="right"
          trigger={
            <button
              type="button"
              className={`chrome-btn${pop === 'camera' ? ' on' : ''}`}
              aria-label="Camera"
              aria-haspopup="dialog"
              aria-expanded={pop === 'camera'}
              title="Player camera: what the TV shows (the dashed box)"
              onClick={() => togglePop('camera')}
            >
              <Icon name="camera" size={16} />
            </button>
          }
        >
          <h3>Player camera</h3>
          <div className="map-pop-choices">
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
                className="btn small"
                aria-pressed={scene.playerCamera.mode === m}
                onClick={() => patch({ playerCamera: { ...scene.playerCamera, mode: m } })}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="btn small"
              aria-pressed={scene.playerCamera.mode === 'manual'}
              onClick={useMyView}
              title="Show the players what you see now"
            >
              Use my view
            </button>
          </div>
        </MapPop>

        <MapPop
          open={pop === 'party'}
          onClose={closePop}
          label="Place player characters"
          side="right"
          trigger={
            <button
              type="button"
              className={`chrome-btn${pop === 'party' || mode === 'party' || pending?.kind === 'pc' ? ' on' : ''}`}
              aria-label="Add player characters"
              aria-haspopup="dialog"
              aria-expanded={pop === 'party'}
              title="Add player characters: the whole party or one at a time"
              onClick={() => togglePop('party')}
            >
              <Icon name="party" size={16} />
            </button>
          }
        >
          <h3>Player characters</h3>
          <button
            type="button"
            className="btn small primary"
            disabled={pcs.length === 0}
            title="Click the map or an entry marker to drop the party there"
            onClick={() => beginPlacing('party')}
          >
            Place whole party
          </button>
          {pcs.length === 0 ? (
            <p className="muted small">No player characters in this campaign.</p>
          ) : (
            <ul className="picker-list">
              {pcs.map((pc) => {
                const verb = pcTokenId(pc.id) ? 'Move' : 'Place';
                return (
                  <li key={pc.id}>
                    <span>
                      {pc.name} {verb === 'Move' && <span className="muted small">on map</span>}
                    </span>
                    <button
                      type="button"
                      className="btn tiny"
                      aria-label={`${verb} ${pc.name}`}
                      onClick={() => beginPlacing('place', { kind: 'pc', pc })}
                    >
                      {verb}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </MapPop>

        <MapPop
          open={pop === 'creature'}
          onClose={closePop}
          label="Place a creature"
          side="right"
          trigger={
            <button
              type="button"
              className={`chrome-btn${pop === 'creature' || pending?.kind === 'creature' || pending?.kind === 'marker' ? ' on' : ''}`}
              aria-label="Add creature or marker"
              aria-haspopup="dialog"
              aria-expanded={pop === 'creature'}
              title="Add a creature or a marker token"
              onClick={() => togglePop('creature')}
            >
              <Icon name="paw" size={16} />
            </button>
          }
        >
          <h3>Creatures</h3>
          <input
            type="text"
            aria-label="Find creature to place"
            placeholder="Find a creature…"
            autoFocus
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
                    aria-label={`Place ${row.displayName}`}
                    onClick={() => beginPlacing('place', { kind: 'creature', row })}
                  >
                    Place
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn small"
            title="A plain disc for objects, traps and notes"
            onClick={() => beginPlacing('place', { kind: 'marker' })}
          >
            Place marker token
          </button>
        </MapPop>

        <button
          type="button"
          className={`chrome-btn${mode === 'marker' ? ' on' : ''}`}
          aria-pressed={mode === 'marker'}
          aria-label="Add entry marker"
          title="Add entry marker: click the map to drop one"
          onClick={() => {
            closePop();
            if (mode === 'marker') cancelMode();
            else beginPlacing('marker');
          }}
        >
          <Icon name="door" size={16} />
        </button>
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
            cancelMode();
            setMenu(null);
          }
          if (e.key === 'Delete' && selectedTokenId) removeToken(selectedTokenId);
          if (e.key === 'Delete' && selectedEntry) removeEntry(selectedEntry.id);
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
          {scene.entryMarkers.map((m) => {
            const placing = mode === 'party' || mode === 'place';
            return (
              <button
                type="button"
                key={m.id}
                className={`entry-marker${selectedEntry?.id === m.id ? ' selected' : ''}`}
                data-testid="entry-marker"
                aria-pressed={selectedEntry?.id === m.id}
                title={placing ? `Place here: ${m.name}` : `${m.name}: select to edit`}
                style={{ ...pointStyle(entryPoint(m)), fontSize: grid.cellPx * 0.3 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(null);
                  if (placing) placeAt(entryPoint(m), e.shiftKey);
                  else setSelection({ kind: 'entry', id: m.id });
                }}
              >
                {m.name}
              </button>
            );
          })}
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

      <div className="map-actions">
        <button
          type="button"
          className="btn small primary"
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
        <MapPop
          open={pop === 'encounter'}
          onClose={closePop}
          label="Place an encounter"
          side="up"
          trigger={
            <button
              type="button"
              className="btn small"
              aria-haspopup="dialog"
              aria-expanded={pop === 'encounter'}
              disabled={!!combatEncounterId}
              title={
                combatEncounterId
                  ? 'End the current fight first'
                  : "Drop a built encounter's creatures here, hidden from the players"
              }
              onClick={() => togglePop('encounter')}
            >
              Place encounter…
            </button>
          }
        >
          <h3>Built encounters</h3>
          <ul className="picker-list">
            {placeable.length === 0 && <li className="muted">No built encounters to place.</li>}
            {placeable.map((e) => (
              <li key={e.id}>
                <span>
                  {e.name}{' '}
                  <span className="muted small">
                    {e.combatants
                      .filter((t) => t.ref.kind !== 'pc')
                      .reduce((n, t) => n + t.quantity, 0)}{' '}
                    creatures
                  </span>
                </span>
                <button
                  type="button"
                  className="btn tiny"
                  aria-label={`Place ${e.name}`}
                  onClick={() => void placeEncounter(e)}
                >
                  Place
                </button>
              </li>
            ))}
          </ul>
        </MapPop>
        <button
          type="button"
          className="btn small"
          disabled={!scene.tokens.some((t) => t.kind === 'pc')}
          title="Take every player character token off this map"
          onClick={() => {
            patch({ tokens: scene.tokens.filter((t) => t.kind !== 'pc') });
            if (selectedToken?.kind === 'pc') setSelection(null);
          }}
        >
          Remove party
        </button>
        {hiddenCreatures.length > 0 && (
          <button
            type="button"
            className="btn small"
            title="Show every hidden creature token to the players"
            onClick={() =>
              patch({
                tokens: scene.tokens.map((t) =>
                  t.kind === 'creature' && t.hidden ? { ...t, hidden: false } : t,
                ),
              })
            }
          >
            Reveal creatures ({hiddenCreatures.length})
          </button>
        )}
        {linkedEncounter && (
          <button
            type="button"
            className="btn small"
            onClick={() => patch({ encounterId: undefined })}
            title="Forget the linked encounter so a new one is built from the tokens"
          >
            Unlink {linkedEncounter.name}
          </button>
        )}
      </div>

      <div className="map-context">
        {hint ? (
          <>
            <p className="muted small" role="status">
              {hint}
            </p>
            <button type="button" className="btn tiny" onClick={cancelMode}>
              Cancel
            </button>
          </>
        ) : selectedToken ? (
          <div className="map-inspector" data-testid="token-inspector">
            <h3>{TOKEN_KIND_LABEL[selectedToken.kind]}</h3>
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
            <span className="spacer" />
            <button
              type="button"
              className="chrome-btn"
              aria-label="Set token art"
              title="Set art…"
              onClick={() => void setArt(selectedToken.id)}
            >
              <Icon name="image" size={15} />
            </button>
            <button
              type="button"
              className="chrome-btn danger"
              aria-label="Remove token"
              title="Remove token (Delete)"
              onClick={() => removeToken(selectedToken.id)}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ) : selectedEntry ? (
          <div className="map-inspector" data-testid="entry-inspector">
            <h3>Entry marker</h3>
            <label className="field inline">
              Name
              <input
                type="text"
                value={selectedEntry.name}
                onChange={(e) => patchEntry(selectedEntry.id, { name: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn small"
              disabled={pcs.length === 0}
              onClick={() => placeParty(entryPoint(selectedEntry))}
            >
              Place party here
            </button>
            <span className="spacer" />
            <button
              type="button"
              className="chrome-btn danger"
              aria-label="Remove entry marker"
              title="Remove entry marker (Delete)"
              onClick={() => removeEntry(selectedEntry.id)}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ) : (
          <p className="muted small">
            Select a token or entry marker to edit it. Drag tokens (Alt for free placement), drag
            the map to pan, wheel to zoom.
          </p>
        )}
      </div>
    </div>
  );
}

const TOKEN_KIND_LABEL: Record<Token['kind'], string> = {
  pc: 'Player character',
  creature: 'Creature',
  marker: 'Marker',
};

function pointStyle(p: Point) {
  return { left: p.x, top: p.y };
}

/**
 * A pop-up anchored to its trigger: beside the tool strip or above the action bar. Not modal;
 * a click elsewhere or Escape closes it.
 */
function MapPop({
  open,
  onClose,
  label,
  side,
  trigger,
  children,
}: {
  open: boolean;
  onClose(): void;
  label: string;
  side: 'right' | 'up';
  trigger: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <div className="map-pop-anchor" ref={ref}>
      {trigger}
      {open && (
        <div className={`map-pop ${side}`} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
