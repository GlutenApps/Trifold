import type {
  Adventure,
  Campaign,
  CombatState,
  CompendiumRecord,
  Encounter,
  EncounterResult,
  LibrarySettings,
  Note,
  NPC,
  PCCard,
  RecordKind,
  Scene,
  SceneImage,
  Source,
} from '@trifold/schema';

/**
 * The one interface between the renderer and the main process (DESIGN.md §4.4).
 * The preload script turns it into `window.trifold` mechanically from `API_METHODS`, and the main
 * process registers one IPC handler per method from the same table. Add a method here, implement it
 * in `apps/desktop/src/main/api.ts`, list it in `API_METHODS`, and the compile-time check below fails
 * until all three agree.
 */

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  userDataPath: string;
}

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
  isInternal: boolean;
}

export interface IndexInfo {
  ok: boolean;
  version: number;
  error: string | null;
}

export interface LibraryInfo {
  path: string;
  /** False when the folder could not be created or `library.json` failed to parse; see `error`. */
  ok: boolean;
  error: string | null;
  settings: LibrarySettings | null;
  index: IndexInfo;
}

export interface PresenterOverlays {
  sceneTitle: boolean;
  initiativeStrip: boolean;
  pcHealthBars: boolean;
  roundCounter: boolean;
}

export interface TitleCardScene {
  kind: 'title';
  id: string;
  title: string;
  subtitle?: string;
  backdrop?: 'parchment' | 'stone' | 'dark';
}

export interface ImageScene {
  kind: 'image';
  id: string;
  title: string;
  /** `trifold-media://` URL of the display-size copy. */
  imageUrl: string;
  width: number;
  height: number;
}

export type LiveScene = TitleCardScene | ImageScene;

export type Handout =
  { kind: 'text'; title: string; body: string } | { kind: 'image'; url: string; title?: string };

export interface BreakScreen {
  title: string;
  subtitle?: string;
  /** Milliseconds since epoch when the countdown ends; absent for no countdown. */
  endsAt?: number;
}

/** Player-facing view of the tracker (DESIGN.md §6.4): masked names, no exact creature HP. */
export interface CombatSummaryEntry {
  id: string;
  name: string;
  role: 'ally' | 'enemy' | 'neutral';
  isPc: boolean;
  dead: boolean;
  /** 0–1, PCs only, and only when the health-bar overlay is on. */
  hpFraction?: number;
  bloodied: boolean;
}

export interface CombatSummary {
  round: number;
  activeId: string | null;
  entries: CombatSummaryEntry[];
}

/** Authoritative presenter state. Owned by the console, relayed by main, rendered by the player. */
export interface PresenterState {
  schemaVersion: 1;
  blackout: boolean;
  scene: LiveScene | null;
  /** Whether the scene title overlay applies to the live scene (global toggle + per-scene override). */
  showSceneTitle: boolean;
  overlays: PresenterOverlays;
  handout: Handout | null;
  breakScreen: BreakScreen | null;
  combat: CombatSummary | null;
  /** Milliseconds since epoch; lets the player ignore stale updates. */
  updatedAt: number;
}

export const initialPresenterState: PresenterState = {
  schemaVersion: 1,
  blackout: true,
  scene: null,
  showSceneTitle: true,
  overlays: { sceneTitle: true, initiativeStrip: true, pcHealthBars: false, roundCounter: true },
  handout: null,
  breakScreen: null,
  combat: null,
  updatedAt: 0,
};

/** Media inside the Library is served to the renderer over this scheme (main registers it). */
export const MEDIA_SCHEME = 'trifold-media';

export function mediaUrl(campaignSlug: string, relativePath: string): string {
  const parts = [`campaigns`, campaignSlug, ...relativePath.split('/')].map(encodeURIComponent);
  return `${MEDIA_SCHEME}://library/${parts.join('/')}`;
}

// ---------- sources and compendium (DESIGN.md §6.1) ----------

/** A source on disk plus whether its records predate the current importer. */
export interface SourceSummary extends Source {
  stale: boolean;
  /** Ships with the app (SRD); cannot be removed or re-parsed, only switched off. */
  bundled: boolean;
}

/** One attribution block for the About page (DESIGN.md §6.1). */
export interface AttributionEntry {
  sourceId: string;
  name: string;
  statement: string;
  licenses: Array<{ key: string; name: string; text: string }>;
  permalink: string;
}

export interface ImportProgress {
  phase: 'hashing' | 'copying' | 'parsing' | 'writing' | 'indexing' | 'done';
  records: number;
  bytesRead: number;
  totalBytes: number;
}

export interface ImportReport {
  sourceId: string;
  name: string;
  status: 'imported' | 'updated' | 'unchanged';
  counts: Partial<Record<RecordKind, number>>;
  warnings: string[];
  durationMs: number;
  diff?: { added: number; changed: number; removed: number };
}

export interface CompendiumQuery {
  kind: RecordKind;
  text?: string;
  sourceIds?: string[];
  edition?: 'all' | '2024' | '2014';
  crMin?: number;
  crMax?: number;
  type?: string;
  size?: string;
  environment?: string;
  npc?: 'any' | 'only' | 'exclude';
  level?: number;
  includeDisabled?: boolean;
  limit?: number;
  offset?: number;
}

/** One list row; read straight from index columns, never from record JSON. */
export interface CompendiumRow {
  id: string;
  kind: RecordKind;
  key: string;
  name: string;
  displayName: string;
  sourceId: string;
  sourceName: string;
  edition: string;
  cr: string | null;
  type: string | null;
  size: string | null;
  environment: string | null;
  isNpc: boolean;
  level: number | null;
  typeCode: string | null;
  rarity: string | null;
}

export interface CompendiumSearchResult {
  rows: CompendiumRow[];
  total: number;
  tookMs: number;
}

export interface CompendiumFacets {
  types: string[];
  sizes: string[];
  environments: string[];
}

export interface IndexStats {
  records: number;
  sources: number;
  version: number;
  tookMs: number;
}

// ---------- campaigns, PC cards, encounters (DESIGN.md §6.3–6.4) ----------

export interface CampaignSummary {
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
  pcCount: number;
  encounterCount: number;
}

/** Everything the console needs when a campaign is open. */
export interface CampaignBundle {
  campaign: Campaign;
  pcs: PCCard[];
  encounters: Encounter[];
  adventures: Adventure[];
  notes: Note[];
  npcs: NPC[];
  scenes: Scene[];
}

export interface CampaignImportReport {
  campaignId: string;
  name: string;
  mode: 'new' | 'merge';
  counts: {
    pcs: number;
    npcs: number;
    notes: number;
    adventures: number;
    encounters: number;
    statBlocks: number;
  };
  /** Combatant names that matched no record and no PC; imported as custom combatants. */
  unresolved: string[];
  warnings: string[];
}

export interface TrifoldApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  library: {
    getInfo(): Promise<LibraryInfo>;
    /** Native folder picker. Resolves to null when cancelled. */
    chooseFolder(): Promise<string | null>;
    /** Opens (creating the layout if needed) and switches the app to that Library. */
    open(path: string): Promise<LibraryInfo>;
    openInExplorer(): Promise<void>;
    getSettings(): Promise<LibrarySettings>;
    updateSettings(patch: Partial<LibrarySettings>): Promise<LibrarySettings>;
  };
  displays: {
    list(): Promise<DisplayInfo[]>;
  };
  player: {
    open(displayId?: number | null): Promise<void>;
    close(): Promise<void>;
    isOpen(): Promise<boolean>;
  };
  presenter: {
    push(state: PresenterState): Promise<void>;
    get(): Promise<PresenterState>;
  };
  sources: {
    list(): Promise<SourceSummary[]>;
    /** Native file picker for XML files. Resolves to null when cancelled. */
    chooseFile(): Promise<string | null>;
    /** Imports (or re-imports) a Lion's Den compendium XML file. Progress arrives as events. */
    importFile(path: string): Promise<ImportReport>;
    /** Re-parses a source from its stored original.xml with the current importer. */
    reimport(sourceId: string): Promise<ImportReport>;
    setEnabled(sourceId: string, enabled: boolean): Promise<Source>;
    remove(sourceId: string): Promise<void>;
    rebuildIndex(): Promise<IndexStats>;
    /** License statements for bundled content, always shown in About. */
    attribution(): Promise<AttributionEntry[]>;
  };
  campaigns: {
    list(): Promise<CampaignSummary[]>;
    create(name: string): Promise<CampaignBundle>;
    open(campaignId: string): Promise<CampaignBundle>;
    /** The campaign opened last time, reopened on start; null when none. */
    current(): Promise<CampaignBundle | null>;
    close(): Promise<void>;
    update(patch: Partial<Campaign>): Promise<Campaign>;
    /** Native file picker for campaign XML. Resolves to null when cancelled. */
    chooseXmlFile(): Promise<string | null>;
    /** Imports a Game Master campaign XML or a Fight Club GM export (DATA-FORMATS.md §3). */
    importXml(path: string, mode: 'new' | 'merge'): Promise<CampaignImportReport>;
  };
  adventures: {
    save(adventure: Adventure): Promise<Adventure>;
    remove(adventureId: string): Promise<void>;
  };
  notes: {
    save(note: Note): Promise<Note>;
    remove(noteId: string): Promise<void>;
  };
  npcs: {
    save(npc: NPC): Promise<NPC>;
    remove(npcId: string): Promise<void>;
  };
  pcs: {
    save(pc: PCCard): Promise<PCCard>;
    remove(pcId: string): Promise<void>;
    /** One PC per line: `Name, Player, Class L, HP, AC, Init, Speed, PP`. */
    quickAdd(text: string): Promise<PCCard[]>;
  };
  encounters: {
    save(encounter: Encounter): Promise<Encounter>;
    remove(encounterId: string): Promise<void>;
    /** Autosave of live combat; null clears it. */
    saveState(encounterId: string, state: CombatState | null): Promise<Encounter>;
    finish(encounterId: string, result: EncounterResult): Promise<Encounter>;
  };
  scenes: {
    save(scene: Scene): Promise<Scene>;
    remove(sceneId: string): Promise<void>;
    /** Native picker; copies the image into the campaign and makes a display-size copy. */
    importImage(): Promise<SceneImage | null>;
  };
  compendium: {
    search(query: CompendiumQuery): Promise<CompendiumSearchResult>;
    get(recordId: string): Promise<CompendiumRecord | null>;
    /** Every edition of a record sharing one key, across enabled sources. */
    findByKey(kind: RecordKind, key: string): Promise<CompendiumRecord[]>;
    facets(kind: RecordKind): Promise<CompendiumFacets>;
  };
}

export type ApiNamespace = keyof TrifoldApi;

/** Every method, by namespace. The preload and the IPC registry iterate this table. */
export const API_METHODS = {
  app: ['getInfo'],
  library: ['getInfo', 'chooseFolder', 'open', 'openInExplorer', 'getSettings', 'updateSettings'],
  displays: ['list'],
  player: ['open', 'close', 'isOpen'],
  presenter: ['push', 'get'],
  sources: [
    'list',
    'chooseFile',
    'importFile',
    'reimport',
    'setEnabled',
    'remove',
    'rebuildIndex',
    'attribution',
  ],
  campaigns: ['list', 'create', 'open', 'current', 'close', 'update', 'chooseXmlFile', 'importXml'],
  adventures: ['save', 'remove'],
  notes: ['save', 'remove'],
  npcs: ['save', 'remove'],
  scenes: ['save', 'remove', 'importImage'],
  pcs: ['save', 'remove', 'quickAdd'],
  encounters: ['save', 'remove', 'saveState', 'finish'],
  compendium: ['search', 'get', 'findByKey', 'facets'],
} as const satisfies { [N in ApiNamespace]: readonly (keyof TrifoldApi[N])[] };

// Compile-time check: every method of TrifoldApi is listed in API_METHODS.
type UnlistedMethods = {
  [N in ApiNamespace]: Exclude<keyof TrifoldApi[N], (typeof API_METHODS)[N][number]>;
}[ApiNamespace];
const _everyMethodIsListed: UnlistedMethods extends never ? true : never = true;
void _everyMethodIsListed;

export function channelName(ns: ApiNamespace, method: string): string {
  return `trifold:${ns}.${method}`;
}

/** Events pushed from main to a renderer without a request. */
export interface TrifoldEvents {
  presenterState: PresenterState;
  playerWindowChanged: { open: boolean };
  importProgress: ImportProgress;
}

export const EVENT_CHANNELS: { [E in keyof TrifoldEvents]: string } = {
  presenterState: 'trifold:event:presenter-state',
  playerWindowChanged: 'trifold:event:player-window-changed',
  importProgress: 'trifold:event:import-progress',
};

/** What `window.trifold` actually is: the API plus an event subscription. */
export interface TrifoldBridge extends TrifoldApi {
  on<E extends keyof TrifoldEvents>(
    event: E,
    listener: (payload: TrifoldEvents[E]) => void,
  ): () => void;
}
