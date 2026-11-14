import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ulid } from 'ulid';
import { mediaUrl, type CompendiumRow } from '@trifold/api';
import { numberedNames } from '@trifold/rules';
import {
  nowIso,
  type Combatant,
  type CombatantTemplate,
  type Encounter,
  type NPC,
  type PCCard,
  type Scene,
  type SceneFog,
  type Token,
} from '@trifold/schema';
import { capitalize } from '../compendium/formatting';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useIconStore } from '../../stores/iconStore';
import { useShellStore } from '../../stores/shellStore';
import { InlineConfirm } from '../shell/InlineConfirm';
import { Icon } from '../shell/icons';
import { FogLayer, GridLines } from './MapLayer';
import {
  activeFog,
  addShape,
  allShape,
  dragRect,
  polyShape,
  rectShape,
  svgPoints,
  tokensInView,
  type FogMode,
} from './fog';
import { registerHotkey } from '../../hotkeys';
import { hk } from '../../platform';
import { MapPop } from './MapPop';
import { TokenDisc } from './TokenDisc';
import {
  combatantCandidates,
  sceneInPlay,
  turnOrderByToken,
  unlinkedCombatants,
} from './tokenLinks';
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

/**
 * The console side of a map or blank-grid scene (DESIGN.md §6.5), shown inside the TV tab
 * (ADR 0008): the DM camera, grid alignment, backgrounds, token placement and drag, the player
 * camera, and the links between tokens and a running fight (ADR 0012). The types and constants
 * here belong to the editor's modes and pop-ups; `MapEditor` further down has the detail.
 */

type Mode = 'select' | 'align' | 'party' | 'place' | 'fog';

/** The fog tool (ADR 0029): what a shape does, and how it is drawn. */
interface FogTool {
  mode: FogMode;
  shape: 'rect' | 'poly';
}

const NO_FOG: SceneFog = { enabled: false, shapes: [] };
const FOG_UNDO_LIMIT = 50;

type Pending =
  | { kind: 'creature'; row: CompendiumRow }
  | { kind: 'marker' }
  | { kind: 'pc'; pc: PCCard }
  /** A campaign NPC, with the size and type of its stat block when it has one. */
  | { kind: 'npc'; npc: NPC; size?: string; type?: string };

/** What the panel under the map is showing options for. */
type Selection = { kind: 'token'; id: string } | null;

/** The tool strip's and action bar's pop-ups; one open at a time. */
type Pop = 'grid' | 'backgrounds' | 'camera' | 'party' | 'creature' | 'encounter';

interface DmCamera {
  x: number;
  y: number;
  zoom: number;
}

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const NO_SCENES: Scene[] = [];
const NO_NPCS: NPC[] = [];
const NO_COMBATANTS: Combatant[] = [];

/**
 * The console side of a map or blank-grid scene (DESIGN.md §6.5): DM camera, grid alignment,
 * tokens with snap-to-grid drag and party placement, the player camera and its
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
  const npcs = useCampaignStore((s) => s.current?.npcs ?? NO_NPCS);
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
  const linkToken = useCombatStore((s) => s.linkToken);
  const relinkTokens = useCombatStore((s) => s.relinkTokens);
  const addFromToken = useCombatStore((s) => s.addFromToken);
  const toggleHidden = useCombatStore((s) => s.toggleHidden);
  const markDead = useCombatStore((s) => s.markDead);
  const scenes = useCampaignStore((s) => s.current?.scenes ?? NO_SCENES);
  const liveSceneId = usePresenterStore((s) => s.state.scene?.id ?? null);
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
  const [alignHover, setAlignHover] = useState<Point | null>(null);
  const [alignCells, setAlignCells] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  const [menu, setMenu] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  /** Combatants the DM must choose between when more than one could be the selected token. */
  const [fighterChoices, setFighterChoices] = useState<{
    tokenId: string;
    fighters: Combatant[];
  } | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);
  /** The background whose delete waits on the inline confirm. */
  const [confirmBg, setConfirmBg] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [fogTool, setFogTool] = useState<FogTool>({ mode: 'reveal', shape: 'rect' });
  /** A rectangle being dragged, in map pixels; `free` when Alt turned off the grid snap. */
  const [fogDrag, setFogDrag] = useState<{ a: Point; b: Point; free: boolean } | null>(null);
  /** A polygon being clicked out, and where the pointer is for its closing edge. */
  const [fogPoints, setFogPoints] = useState<Point[]>([]);
  const [fogHover, setFogHover] = useState<Point | null>(null);
  /** Earlier fogs for Undo, this session only. */
  const [fogUndo, setFogUndo] = useState<SceneFog[]>([]);
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
  // The fight on this map (ADR 0012): only the map in play compares itself with the tracker.
  const fightEncounter = encounters.find((e) => e.id === combatEncounterId) ?? null;
  const fighters = combatState?.combatants ?? NO_COMBATANTS;
  const inPlay = !!combatState && sceneInPlay(scenes, liveSceneId, fightEncounter)?.id === scene.id;
  const turnOrder = inPlay ? turnOrderByToken(fighters) : new Map<string, number>();
  const fighterByToken = new Map(
    inPlay ? fighters.filter((c) => c.tokenId).map((c) => [c.tokenId!, c] as const) : [],
  );
  const tokensRef = useRef(scene.tokens);
  tokensRef.current = scene.tokens;
  const unlinkedKey = inPlay
    ? unlinkedCombatants(fighters, scene.tokens)
        .map((c) => c.id)
        .join(',')
    : '';
  const tokensKey = scene.tokens.map((t) => t.id).join(',');
  useEffect(() => {
    if (inPlay && unlinkedKey) relinkTokens(tokensRef.current);
  }, [inPlay, unlinkedKey, tokensKey, relinkTokens]);

  /** The inspector's Link button: the one match, a choice of several, or a newcomer. */
  const linkSelected = (token: Token) => {
    const candidates = combatantCandidates(token, fighters, scene.tokens);
    if (candidates.length === 1) linkToken(candidates[0]!.id, token.id);
    else if (candidates.length === 0) void addFromToken(token);
    else setFighterChoices({ tokenId: token.id, fighters: candidates });
  };

  /** Hidden and dead on a token in the fight belong to its combatant; the token follows. */
  const setTokenHidden = (t: Token, hidden: boolean) => {
    const fighter = fighterByToken.get(t.id);
    if (fighter) {
      if (fighter.hidden !== hidden) toggleHidden(fighter.id);
    } else patchToken(t.id, { hidden });
  };
  const setTokenDead = (t: Token, dead: boolean) => {
    const fighter = fighterByToken.get(t.id);
    if (fighter) markDead(fighter.id, dead);
    else patchToken(t.id, { dead });
  };
  // The dashed box shows what the TV frames: tokens the players can see (not hidden, not fogged).
  const playerTokens = tokensInView(
    scene.tokens.filter((t) => !t.hidden),
    activeFog(scene.fog),
    grid,
  );
  const viewportRect = cameraRect(
    scene.playerCamera,
    size,
    grid,
    playerTokens,
    aspect,
    playerTokens.some((t) => t.id === activeTokenId) ? activeTokenId : null,
  );
  const selectedTokenId = selection?.kind === 'token' ? selection.id : null;
  const selectedToken = scene.tokens.find((t) => t.id === selectedTokenId) ?? null;
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
        .search({ kind: 'monster', text: query, limit: 8, collapse: false })
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
  // ---------- fog of war (ADR 0029) ----------
  const fog = scene.fog ?? NO_FOG;
  /** Rectangles snap to whole cells when the scene has a grid (Alt draws freely). */
  const fogGrid = scene.grid || scene.kind === 'blankGrid' ? grid : null;
  const setFog = (next: SceneFog) => {
    setFogUndo((u) => [...u.slice(-(FOG_UNDO_LIMIT - 1)), fog]);
    patch({ fog: next });
  };
  /** A drawn shape turns the fog on: drawing is how the DM starts using it. */
  const addFog = (shape: Parameters<typeof addShape>[1]) =>
    setFog({ enabled: true, shapes: addShape(fog.shapes, shape) });
  const undoFog = () => {
    const previous = fogUndo[fogUndo.length - 1];
    if (!previous) return;
    setFogUndo((u) => u.slice(0, -1));
    patch({ fog: previous });
  };
  const closeFogPolygon = (points: Point[] = fogPoints) => {
    const shape = polyShape(fogTool.mode, points);
    if (shape) addFog(shape);
    setFogPoints([]);
    setFogHover(null);
  };
  const fogUndoRef = useRef(undoFog);
  fogUndoRef.current = undoFog;
  // A new scene starts its own undo history.
  useEffect(() => {
    setFogUndo([]);
    setFogPoints([]);
    setFogDrag(null);
  }, [scene.id]);

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

  /**
   * A campaign NPC's token (DESIGN.md §6.5): tied to the NPC by identity like an encounter's NPC
   * token (ADR 0012), sized and masked from its stat block, starting neutral.
   */
  const npcToken = (p: Extract<Pending, { kind: 'npc' }>, at: Point): Token => {
    const glyph = glyphFor({ name: p.npc.name, ...(p.type ? { type: p.type } : {}) }, 'creature');
    return {
      id: ulid(),
      kind: 'creature',
      ref: { kind: 'npc', npcId: p.npc.id, name: p.npc.name },
      label: p.npc.name,
      maskedLabel: p.type ? capitalize(p.type) : 'Creature',
      x: at.x,
      y: at.y,
      footprint: footprintForSize(p.size),
      role: 'neutral',
      hidden: false,
      nameMasked: true,
      dead: !p.npc.isAlive,
      ...(p.npc.portrait ? { art: p.npc.portrait } : {}),
      ...(glyph ? { glyph } : {}),
    };
  };

  /** Starts placing an NPC once its stat block's size and type are known. */
  const beginNpc = async (npc: NPC) => {
    let size: string | undefined;
    let type: string | undefined;
    if (npc.recordRef) {
      const record = await window.trifold.compendium.get(npc.recordRef.recordId).catch(() => null);
      if (record?.kind === 'monster') {
        size = record.data.size ?? undefined;
        type = record.data.type || undefined;
      }
    }
    beginPlacing('place', {
      kind: 'npc',
      npc,
      ...(size ? { size } : {}),
      ...(type ? { type } : {}),
    });
  };

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
    if (pending.kind === 'npc') {
      // One token per NPC on a map, like a PC: placing them again moves them.
      const was = scene.tokens.find((t) => t.ref.kind === 'npc' && t.ref.npcId === pending.npc.id);
      const token = was ? { ...was, x: cell.x, y: cell.y } : npcToken(pending, cell);
      patch({ tokens: [...scene.tokens.filter((t) => t.id !== was?.id), token] });
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

  /** A click on the map while a placing mode is on. */
  const placeAt = (at: Point, keepPlacing: boolean) => {
    if (mode === 'party') {
      placeParty(at);
      setMode('select');
      return;
    }
    placePending(at);
    if (!keepPlacing || pending?.kind === 'pc' || pending?.kind === 'npc') {
      setPending(null);
      setMode('select');
    }
  };

  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === 'fog') {
      onFogDown(e);
      return;
    }
    if (e.button === 2) return;
    setMenu(null);
    const at = mapPoint(e);
    if (mode === 'align') {
      if (!alignFirst) {
        setAlignFirst(at);
        return;
      }
      const derived = alignFromClicks(alignFirst, at, alignCells);
      if (derived) patchGrid(derived);
      setAlignFirst(null);
      setAlignHover(null);
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

  /**
   * Fog mode: the left button draws (a rectangle by dragging, a polygon by clicking its corners);
   * the right or middle button pans, so the map still moves while drawing.
   */
  const onFogDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setMenu(null);
    if (e.button !== 0) {
      pan.current = { startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    const at = mapPoint(e);
    if (fogTool.shape === 'rect') {
      setFogDrag({ a: at, b: at, free: e.altKey });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    const near = (p: Point | undefined) =>
      !!p && Math.hypot(p.x - at.x, p.y - at.y) * cam.zoom < 10;
    // Clicking the first corner again closes it; a second click on the last corner is ignored.
    if (fogPoints.length >= 3 && near(fogPoints[0])) closeFogPolygon();
    else if (!near(fogPoints[fogPoints.length - 1])) setFogPoints([...fogPoints, at]);
  };

  const onBackgroundMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === 'fog' && !pan.current) {
      const at = mapPoint(e);
      if (fogDrag) setFogDrag({ ...fogDrag, b: at, free: e.altKey });
      else if (fogPoints.length) setFogHover(at);
      return;
    }
    if (mode === 'align' && alignFirst) setAlignHover(mapPoint(e));
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
    if (fogDrag) {
      const r = dragRect(fogDrag.a, fogDrag.b, fogDrag.free ? null : fogGrid);
      // A click without a drag reveals one cell on a grid, nothing without one.
      if (r.w > 0 && r.h > 0) addFog(rectShape(fogTool.mode, r));
      setFogDrag(null);
    }
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
      : mode === 'align' || mode === 'fog'
        ? 'crosshair'
        : 'copy';

  const block = alignCells > 1 ? `a block of ${alignCells}×${alignCells} cells` : 'a cell';
  const hint =
    mode === 'align'
      ? alignFirst
        ? `Now click the opposite corner of ${alignCells > 1 ? 'that block' : 'that cell'}`
        : `Click one corner of ${block}`
      : mode === 'party'
        ? 'Click the map to place the party'
        : mode === 'place'
          ? pending?.kind === 'pc'
            ? `Click to place ${pending.pc.name}`
            : pending?.kind === 'npc'
              ? `Click to place ${pending.npc.name}`
              : `Click to place ${pending?.kind === 'creature' ? pending.row.displayName : 'a marker'} (Shift keeps placing)`
          : null;

  const cancelMode = () => {
    setMode('select');
    setPending(null);
    setAlignFirst(null);
    setAlignHover(null);
    setAlignFirst(null);
    setFogPoints([]);
    setFogHover(null);
    setFogDrag(null);
  };
  const toggleFogMode = () => {
    if (mode === 'fog') {
      cancelMode();
      return;
    }
    cancelMode();
    closePop();
    setMode('fog');
    containerRef.current?.focus();
  };
  const toggleFogRef = useRef(toggleFogMode);
  toggleFogRef.current = toggleFogMode;

  // Table-time hotkeys (CLAUDE.md): F opens and closes the fog tools on the map shown; Ctrl+Z
  // undoes the last fog change while they are open (only then, so it never shadows typing).
  useEffect(
    () =>
      registerHotkey({
        id: 'map.fog',
        combo: 'F',
        description: 'Fog of war tools on the map',
        // A parked (hidden) panel stays mounted; only the map on screen answers.
        run: () => {
          if (containerRef.current?.getClientRects().length) toggleFogRef.current();
        },
      }),
    [],
  );
  useEffect(() => {
    if (mode !== 'fog') return;
    return registerHotkey({
      id: 'map.fog.undo',
      combo: 'Ctrl+Z',
      description: 'Undo the last fog change',
      run: () => fogUndoRef.current(),
    });
  }, [mode]);
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
          <Icon name="hand" />
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
              <Icon name="grid" />
            </button>
          }
        >
          <h3>Grid</h3>
          <div className="map-align-row">
            <button
              type="button"
              className="btn"
              title="Click two opposite corners of a square block of cells on the map. A bigger block (10×10 or more) aligns a printed grid far more accurately than one cell."
              onClick={() => {
                setAlignFirst(null);
                setAlignHover(null);
                beginPlacing('align');
              }}
            >
              Align grid to map
            </button>
            <label className="field">
              Cells across
              <input
                type="number"
                className="narrow"
                min={1}
                max={200}
                step={1}
                value={alignCells}
                title="How many cells wide (and tall) the block you click is. 1 is one cell; 10 means click opposite corners of a 10×10 block."
                onChange={(e) =>
                  setAlignCells(Math.min(200, Math.max(1, Math.floor(Number(e.target.value) || 1))))
                }
              />
            </label>
          </div>
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
                <Icon name="image" />
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
                    {confirmBg === b.id ? (
                      <InlineConfirm
                        name={b.name}
                        onConfirm={() => {
                          setConfirmBg(null);
                          commit(removeBackground(scene, b.id));
                        }}
                        onKeep={() => setConfirmBg(null)}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`chrome-btn xs${showing ? ' on' : ''}`}
                          disabled={showing}
                          aria-pressed={showing}
                          aria-label={`${showing ? 'Showing' : 'Show'} ${b.name}`}
                          title={showing ? 'Showing on the map' : 'Show this background'}
                          onClick={() => commit(showBackground(scene, b.id))}
                        >
                          <Icon name="eye" />
                        </button>
                        <button
                          type="button"
                          className="chrome-btn xs"
                          aria-label={`Replace ${b.name} image`}
                          title="Replace image…: pick a new file, keep the name"
                          onClick={() => void replaceBackgroundFile(b.id)}
                        >
                          <Icon name="folder" />
                        </button>
                        <button
                          type="button"
                          className="chrome-btn xs danger"
                          aria-label={`Delete ${b.name}`}
                          title="Delete this background (the image file stays in the campaign folder)"
                          disabled={backgrounds.length < 2}
                          onClick={() => setConfirmBg(b.id)}
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    )}
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
            <button type="button" className="btn" onClick={() => void addBackgroundFile()}>
              Add background…
            </button>
            <p className="muted small">Tokens and grid stay put; the TV crossfades.</p>
          </MapPop>
        )}

        <button
          type="button"
          className={`chrome-btn${mode === 'fog' ? ' on' : ''}`}
          aria-pressed={mode === 'fog'}
          aria-label="Fog of war"
          title={`Fog of war: reveal and hide parts of the map (${hk('F')})`}
          onClick={toggleFogMode}
        >
          <Icon name="fog" />
        </button>

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
              <Icon name="camera" />
            </button>
          }
        >
          <h3>Player camera</h3>
          <div className="seg" role="group" aria-label="Camera mode">
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
              <Icon name="party" />
            </button>
          }
        >
          <h3>Player characters</h3>
          <button
            type="button"
            className="btn primary"
            disabled={pcs.length === 0}
            title="Click the map to drop the party there"
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
                      className="chrome-btn xs"
                      aria-label={`${verb} ${pc.name}`}
                      title={verb === 'Move' ? 'Move: click the map' : 'Place: click the map'}
                      onClick={() => beginPlacing('place', { kind: 'pc', pc })}
                    >
                      <Icon name={verb === 'Move' ? 'hand' : 'plus'} />
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
              className={`chrome-btn${pop === 'creature' || pending?.kind === 'creature' || pending?.kind === 'npc' || pending?.kind === 'marker' ? ' on' : ''}`}
              aria-label="Add creature or marker"
              aria-haspopup="dialog"
              aria-expanded={pop === 'creature'}
              title="Add an NPC, a creature or a marker token"
              onClick={() => togglePop('creature')}
            >
              <Icon name="paw" />
            </button>
          }
        >
          {npcs.length > 0 && (
            <>
              <h3>NPCs</h3>
              <ul className="picker-list" aria-label="Campaign NPCs">
                {npcs.map((npc) => {
                  const onMap = scene.tokens.some(
                    (t) => t.ref.kind === 'npc' && t.ref.npcId === npc.id,
                  );
                  const verb = onMap ? 'Move' : 'Place';
                  return (
                    <li key={npc.id}>
                      <span>
                        {npc.name}{' '}
                        <span className="muted small">
                          {onMap ? 'on map' : npc.isAlive ? npc.role : 'dead'}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="chrome-btn xs"
                        aria-label={`${verb} ${npc.name}`}
                        title={onMap ? 'Move: click the map' : 'Place: click the map'}
                        onClick={() => void beginNpc(npc)}
                      >
                        <Icon name={onMap ? 'hand' : 'plus'} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
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
                    className="chrome-btn xs"
                    aria-label={`Place ${row.displayName}`}
                    title="Place: click the map"
                    onClick={() => beginPlacing('place', { kind: 'creature', row })}
                  >
                    <Icon name="plus" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn"
            title="A plain disc for objects, traps and notes"
            onClick={() => beginPlacing('place', { kind: 'marker' })}
          >
            Place marker token
          </button>
        </MapPop>
      </div>

      <div
        ref={containerRef}
        className={`map-canvas${mode === 'fog' ? ' fog-mode' : ''}`}
        data-testid="map-canvas"
        style={{ cursor }}
        tabIndex={0}
        onPointerDown={onBackgroundDown}
        onPointerMove={onBackgroundMove}
        onPointerUp={onBackgroundUp}
        onPointerCancel={onBackgroundUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={() => {
          if (mode === 'fog' && fogPoints.length >= 3) closeFogPolygon();
        }}
        onKeyDown={(e) => {
          if (mode === 'fog' && fogPoints.length) {
            // A polygon in progress: Enter closes it, Backspace drops a corner, Escape drops it.
            if (e.key === 'Enter') closeFogPolygon();
            if (e.key === 'Backspace') setFogPoints(fogPoints.slice(0, -1));
            if (e.key === 'Escape') {
              e.stopPropagation();
              setFogPoints([]);
              setFogHover(null);
            }
            return;
          }
          if (e.key === 'Escape') {
            cancelMode();
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
          {fog.enabled && (
            <FogLayer
              dm
              zoom={cam.zoom}
              width={size.width}
              height={size.height}
              shapes={fog.shapes}
            />
          )}
          {(fogDrag || fogPoints.length > 0) && (
            <svg
              className={`fog-draft ${fogTool.mode}`}
              data-testid="fog-draft"
              width={size.width}
              height={size.height}
              aria-hidden="true"
            >
              {fogDrag &&
                (() => {
                  const r = dragRect(fogDrag.a, fogDrag.b, fogDrag.free ? null : fogGrid);
                  return <rect x={r.x} y={r.y} width={r.w} height={r.h} />;
                })()}
              {fogPoints.length > 0 && (
                <polyline
                  points={svgPoints(
                    [...fogPoints, ...(fogHover ? [fogHover] : [])].flatMap((p) => [p.x, p.y]),
                  )}
                />
              )}
              {fogPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={Math.max(3, 5 / cam.zoom)} />
              ))}
            </svg>
          )}
          {alignFirst && (
            <div className="align-dot" style={{ left: alignFirst.x, top: alignFirst.y }} />
          )}
          {alignFirst && alignHover && (
            <AlignPreview a={alignFirst} b={alignHover} cells={alignCells} />
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
                {turnOrder.has(token.id) && (
                  <span
                    className="token-order"
                    data-testid="token-order"
                    title="Place in the turn order"
                  >
                    {turnOrder.get(token.id)}
                  </span>
                )}
                {inPlay && !turnOrder.has(token.id) && token.kind !== 'marker' && (
                  <span
                    className="token-order unlinked"
                    data-testid="token-unlinked"
                    role="img"
                    aria-label={`${token.label} is not in the fight`}
                    title="Not in the fight. Select the token to link it."
                  >
                    ?
                  </span>
                )}
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
              const fighter = fighterByToken.get(t.id);
              const candidates =
                inPlay && !fighter ? combatantCandidates(t, fighters, scene.tokens) : [];
              return (
                <>
                  {inPlay && !fighter && t.kind !== 'marker' && (
                    <>
                      {candidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            linkToken(c.id, t.id);
                            setMenu(null);
                          }}
                        >
                          Link to {c.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          void addFromToken(t);
                          setMenu(null);
                        }}
                      >
                        {candidates.length ? 'Add to fight as a newcomer' : 'Add to fight'}
                      </button>
                    </>
                  )}
                  {fighter && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        linkToken(fighter.id, null);
                        setMenu(null);
                      }}
                    >
                      Unlink from {fighter.name}
                    </button>
                  )}
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
                      setTokenHidden(t, !t.hidden);
                      setMenu(null);
                    }}
                  >
                    {t.hidden ? 'Show to players' : 'Hide from players'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTokenDead(t, !t.dead);
                      setMenu(null);
                    }}
                  >
                    {t.dead ? 'Revive' : 'Mark dead'}
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
        <MapPop
          open={pop === 'encounter'}
          onClose={closePop}
          label="Place an encounter"
          side="up"
          trigger={
            <button
              type="button"
              className="btn"
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
                  className="chrome-btn xs"
                  aria-label={`Place ${e.name}`}
                  title="Place it on the map, hidden from the players"
                  onClick={() => void placeEncounter(e)}
                >
                  <Icon name="plus" />
                </button>
              </li>
            ))}
          </ul>
        </MapPop>
        <button
          type="button"
          className="btn"
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
            className="btn"
            title="Show every hidden creature token to the players"
            onClick={() => {
              patch({
                tokens: scene.tokens.map((t) =>
                  t.kind === 'creature' && t.hidden && !fighterByToken.has(t.id)
                    ? { ...t, hidden: false }
                    : t,
                ),
              });
              // Tokens in the fight follow their combatants, so those unhide through the tracker.
              for (const t of hiddenCreatures) {
                const fighter = fighterByToken.get(t.id);
                if (fighter?.hidden) toggleHidden(fighter.id);
              }
            }}
          >
            Reveal creatures ({hiddenCreatures.length})
          </button>
        )}
        {linkedEncounter && (
          <button
            type="button"
            className="btn"
            onClick={() => patch({ encounterId: undefined })}
            title="Forget the linked encounter so a new one is built from the tokens"
          >
            Unlink {linkedEncounter.name}
          </button>
        )}
      </div>

      <div className={`map-context${mode === 'fog' ? ' fog-context' : ''}`}>
        {mode === 'fog' ? (
          <div className="fog-tools" role="toolbar" aria-label="Fog tools">
            <label className="check" title="Off shows the players the whole map; your shapes stay">
              <input
                type="checkbox"
                checked={fog.enabled}
                onChange={(e) => setFog({ ...fog, enabled: e.target.checked })}
              />
              Fog on
            </label>
            <span className="seg" role="group" aria-label="Fog brush">
              {(['reveal', 'hide'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="btn small"
                  aria-pressed={fogTool.mode === m}
                  onClick={() => setFogTool({ ...fogTool, mode: m })}
                >
                  {m === 'reveal' ? 'Reveal' : 'Hide'}
                </button>
              ))}
            </span>
            <span className="icon-toolbar" role="group" aria-label="Fog shape">
              <button
                type="button"
                className={`chrome-btn${fogTool.shape === 'rect' ? ' on' : ''}`}
                aria-pressed={fogTool.shape === 'rect'}
                aria-label="Rectangle"
                title="Rectangle: drag across the map"
                onClick={() => {
                  setFogPoints([]);
                  setFogTool({ ...fogTool, shape: 'rect' });
                }}
              >
                <Icon name="square" />
              </button>
              <button
                type="button"
                className={`chrome-btn${fogTool.shape === 'poly' ? ' on' : ''}`}
                aria-pressed={fogTool.shape === 'poly'}
                aria-label="Polygon"
                title="Polygon: click its corners"
                onClick={() => setFogTool({ ...fogTool, shape: 'poly' })}
              >
                <Icon name="polygon" />
              </button>
            </span>
            <button type="button" className="btn small" onClick={() => addFog(allShape('reveal'))}>
              Reveal all
            </button>
            <button type="button" className="btn small" onClick={() => addFog(allShape('hide'))}>
              Hide all
            </button>
            <button
              type="button"
              className="chrome-btn"
              aria-label="Undo fog"
              title={`Undo the last fog change (${hk('Ctrl+Z')})`}
              disabled={fogUndo.length === 0}
              onClick={undoFog}
            >
              <Icon name="undo" />
            </button>
            <p className="muted small fog-hint" role="status">
              {fogTool.shape === 'rect'
                ? `Drag to ${fogTool.mode}${fogGrid ? ' whole cells (Alt draws freely)' : ''}. Right-drag pans.`
                : fogPoints.length
                  ? 'Click the first corner, double-click or press Enter to finish; Backspace undoes a corner.'
                  : `Click the corners of the area to ${fogTool.mode}. Right-drag pans.`}
            </p>
            <button type="button" className="btn small" onClick={cancelMode}>
              Done
            </button>
          </div>
        ) : hint ? (
          <>
            <p className="muted small" role="status">
              {hint}
            </p>
            <button type="button" className="btn small" onClick={cancelMode}>
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
            <span className="icon-toolbar state-toolbar" role="group" aria-label="Token actions">
              {selectedToken.kind === 'creature' && (
                <button
                  type="button"
                  className={`chrome-btn${selectedToken.nameMasked ? ' on' : ''}`}
                  aria-label={selectedToken.nameMasked ? 'Reveal name' : 'Mask name'}
                  aria-pressed={selectedToken.nameMasked}
                  title={
                    selectedToken.nameMasked
                      ? `Players see "${selectedToken.maskedLabel ?? 'Creature'}". Reveal "${selectedToken.label}"`
                      : `Players see "${selectedToken.label}". Mask it as "${selectedToken.maskedLabel ?? 'Creature'}"`
                  }
                  onClick={() =>
                    patchToken(selectedToken.id, { nameMasked: !selectedToken.nameMasked })
                  }
                >
                  <Icon name={selectedToken.nameMasked ? 'mask' : 'maskOff'} />
                </button>
              )}
              <button
                type="button"
                className={`chrome-btn${selectedToken.hidden ? ' on' : ''}`}
                aria-label={selectedToken.hidden ? 'Show to players' : 'Hide from players'}
                aria-pressed={selectedToken.hidden}
                title={
                  selectedToken.hidden
                    ? 'Show to the players (map and initiative strip)'
                    : 'Hide from the players (map and initiative strip)'
                }
                onClick={() => setTokenHidden(selectedToken, !selectedToken.hidden)}
              >
                <Icon name={selectedToken.hidden ? 'eyeOff' : 'eye'} />
              </button>
              {selectedToken.kind !== 'marker' && (
                <button
                  type="button"
                  className={`chrome-btn${selectedToken.dead ? ' on' : ''}`}
                  aria-label={selectedToken.dead ? 'Revive' : 'Mark dead'}
                  aria-pressed={selectedToken.dead}
                  title={selectedToken.dead ? 'Revive' : 'Mark dead'}
                  onClick={() => setTokenDead(selectedToken, !selectedToken.dead)}
                >
                  <Icon name={selectedToken.dead ? 'skull' : 'skullOff'} />
                </button>
              )}
              {inPlay &&
                selectedToken.kind !== 'marker' &&
                (() => {
                  const fighter = fighterByToken.get(selectedToken.id);
                  return fighter ? (
                    <button
                      type="button"
                      className="chrome-btn on"
                      aria-label={`Unlink from ${fighter.name}`}
                      aria-pressed
                      title={`In the fight as ${fighter.name}. Unlink it`}
                      onClick={() => linkToken(fighter.id, null)}
                    >
                      <Icon name="link" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chrome-btn"
                      aria-label={`Link ${selectedToken.label} to the fight`}
                      title="Link to a combatant in the fight, or add it as a newcomer"
                      onClick={() => linkSelected(selectedToken)}
                    >
                      <Icon name="linkOff" />
                    </button>
                  );
                })()}
              <button
                type="button"
                className="chrome-btn"
                aria-label="Set token art"
                title="Set art…"
                onClick={() => void setArt(selectedToken.id)}
              >
                <Icon name="image" />
              </button>
              <button
                type="button"
                className="chrome-btn"
                aria-label="Remove token"
                title="Remove token from the map (Delete)"
                onClick={() => removeToken(selectedToken.id)}
              >
                <Icon name="close" />
              </button>
            </span>
            {inPlay && fighterByToken.has(selectedToken.id) && (
              <span className="muted small">
                In the fight as {fighterByToken.get(selectedToken.id)!.name}
              </span>
            )}
            {fighterChoices && fighterChoices.tokenId === selectedToken.id && (
              <span className="row" role="group" aria-label="Which combatant">
                <span className="muted">Which combatant is {selectedToken.label}?</span>
                {fighterChoices.fighters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn small"
                    onClick={() => {
                      linkToken(c.id, selectedToken.id);
                      setFighterChoices(null);
                    }}
                  >
                    {c.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    void addFromToken(selectedToken);
                    setFighterChoices(null);
                  }}
                >
                  Newcomer
                </button>
                <button type="button" className="btn small" onClick={() => setFighterChoices(null)}>
                  Cancel
                </button>
              </span>
            )}
          </div>
        ) : (
          <p className="muted small">
            Select a token to edit it. Drag tokens (Alt for free placement), drag the map to pan,
            wheel to zoom.
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

/**
 * Rubber-band preview while aligning: the block of cells the two clicks would span, drawn as a
 * grid so the DM can see its lines land on the map's own grid before committing.
 */
function AlignPreview({ a, b, cells }: { a: Point; b: Point; cells: number }) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w < 1 || h < 1) return null;
  const n = Math.max(1, Math.floor(cells));
  const lines: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n;
    const y = (h * i) / n;
    lines.push(`M ${x} 0 L ${x} ${h}`, `M 0 ${y} L ${w} ${y}`);
  }
  return (
    <svg
      className="align-preview"
      style={{ left, top }}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      <path d={lines.join(' ')} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
