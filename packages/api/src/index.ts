import type { CompendiumRecord, LibrarySettings, RecordKind, Source } from '@trifold/schema';

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

/** A title card is the only scene kind in M0; image, map and blank-grid scenes arrive in M1. */
export interface TitleCardScene {
  kind: 'title';
  id: string;
  title: string;
  subtitle?: string;
}

export type LiveScene = TitleCardScene;

/** Authoritative presenter state. Owned by the console, relayed by main, rendered by the player. */
export interface PresenterState {
  schemaVersion: 1;
  blackout: boolean;
  scene: LiveScene | null;
  overlays: PresenterOverlays;
  /** Milliseconds since epoch; lets the player ignore stale updates. */
  updatedAt: number;
}

export const initialPresenterState: PresenterState = {
  schemaVersion: 1,
  blackout: true,
  scene: null,
  overlays: { sceneTitle: true, initiativeStrip: true, pcHealthBars: false, roundCounter: true },
  updatedAt: 0,
};

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
