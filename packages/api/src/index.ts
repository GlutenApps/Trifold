import type {
  Adventure,
  Campaign,
  CombatState,
  CompendiumRecord,
  Encounter,
  EncounterResult,
  IconTables,
  LibrarySettings,
  Note,
  NoteTemplate,
  NPC,
  PCCard,
  Playlist,
  RecordKind,
  Scene,
  SceneImage,
  Source,
  Track,
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

/** OS settings pages the "Phone audio" guide opens (ADR 0007); see main/systemPages.ts. */
export type SystemPage = 'bluetooth' | 'bluetoothReceiverStore' | 'airplay' | 'sound';

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

/** A rectangle in map pixels: what the TV should show (letterboxed to its own aspect). */
export interface CameraRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LiveGrid {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
  /** False hides the lines on the TV; tokens still snap on the console. */
  visible: boolean;
}

/** A token as the TV sees it: hidden tokens are omitted, masked names already applied. */
export interface LiveToken {
  id: string;
  kind: 'pc' | 'creature' | 'marker';
  /** Grid units, top-left cell of the footprint. */
  x: number;
  y: number;
  footprint: 1 | 2 | 3 | 4;
  label: string;
  role: 'ally' | 'enemy' | 'neutral';
  artUrl?: string;
  /** `trifold-media://icons/<name>.svg`, masked into the disc; custom art wins over it. */
  glyphUrl?: string;
  color?: string;
  dead: boolean;
}

export type TokenStyle = 'engraved' | 'flat' | 'twoTone' | 'plain';

export interface MapScene {
  kind: 'map' | 'blankGrid';
  id: string;
  title: string;
  /** Absent for blank grids, which draw the backdrop instead. */
  imageUrl?: string;
  /** Map size in map pixels. */
  width: number;
  height: number;
  backdrop: 'parchment' | 'stone' | 'dark';
  grid: LiveGrid;
  tokens: LiveToken[];
  tokenStyle: TokenStyle;
  camera: CameraRect;
}

export type LiveScene = TitleCardScene | ImageScene | MapScene;

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
  /** The map token this combatant is linked to, if any. */
  tokenId?: string;
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

// ---------- backups (DESIGN.md §4.2, CLAUDE.md ground rule 6) ----------

export interface BackupInfo {
  /** File name inside Library/backups. */
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: 'daily' | 'manual' | 'preRestore';
}

// ---------- music (DESIGN.md §6.6) ----------

export interface TrackView extends Track {
  /** False when the file is missing; the track stays listed (DATA-FORMATS.md §5.5). */
  available: boolean;
}

export interface MusicLibraryView {
  folders: string[];
  tracks: TrackView[];
  lastScanAt: string | null;
}

export interface MusicScanProgress {
  phase: 'listing' | 'reading' | 'done';
  /** Files read so far and files found in the folders. */
  read: number;
  found: number;
  added: number;
  current?: string;
  /** On `done`: tracks relinked to a renamed or moved file, and tracks whose file is gone. */
  renamed?: number;
  removed?: number;
}

/** A music file, streamed by main from wherever the track lives. */
export function trackUrl(trackId: string): string {
  return `${MEDIA_SCHEME}://track/${encodeURIComponent(trackId)}`;
}

/** Media inside the Library is served to the renderer over this scheme (main registers it). */
export const MEDIA_SCHEME = 'trifold-media';

/** A bundled game-icons glyph, served by main from resources/icons/svg. */
export function iconUrl(name: string): string {
  return `${MEDIA_SCHEME}://icons/${encodeURIComponent(name)}.svg`;
}

/** What the About page shows for the icon set (DESIGN.md §6.8). */
export interface IconCreditsInfo {
  license: { name: string; url: string };
  source: string;
  authors: Array<{ name: string; icons: number }>;
  icons: number;
}

export function mediaUrl(campaignSlug: string, relativePath: string): string {
  const parts = [`campaigns`, campaignSlug, ...relativePath.split('/')].map(encodeURIComponent);
  return `${MEDIA_SCHEME}://library/${parts.join('/')}`;
}

// ---------- phone audio receiver (ADR 0007, Windows) ----------

/** A paired phone Windows can receive audio from. */
export interface PhoneAudioDevice {
  id: string;
  name: string;
}

/** A phone that has been connected before; shown first and connectable in one click. */
export interface RememberedPhone extends PhoneAudioDevice {
  lastConnectedAt: string;
}

export type PhoneAudioState = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

/** Where the table's music comes from: Trifold's own player, or the phone through this computer. */
export type AudioSource = 'computer' | 'phone';

export interface PhoneAudioStatus {
  /** False where the OS cannot do this (macOS: the guide points at AirPlay instead). */
  supported: boolean;
  state: PhoneAudioState;
  /** The phone being connected, connected or retried; null when off. */
  device: PhoneAudioDevice | null;
  /** Why it failed or what it is waiting for, for the status line. */
  detail: string | null;
  remembered: RememberedPhone[];
  /** Chosen on the Music tool and remembered per machine. */
  source: AudioSource;
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
  /**
   * Records sharing a key collapse to one row (DESIGN.md §7.2) unless `collapse` is false;
   * pickers that must reach one exact record turn it off. `preferEdition` names the edition
   * whose record heads a collapsed row when it exists; defaults to 2024.
   */
  collapse?: boolean;
  preferEdition?: '2024' | '2014';
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
  /** Every edition the row stands for, this record's first; more than one means a switch. */
  editions: string[];
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

/** What `notes.remove` does with a folder's contents: move it up a level, or remove it too. */
export type NoteFolderContents = 'lift' | 'delete';

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
    /** Opens an OS settings page; false when this OS has no such page. */
    openSystemPage(page: SystemPage): Promise<boolean>;
    /** Save-as dialog plus write; resolves to the path, or null when cancelled. */
    saveTextFile(options: {
      title: string;
      defaultName: string;
      text: string;
    }): Promise<string | null>;
    /** Opens an http(s) URL in the system browser (ADR 0011); false for any other scheme. */
    openExternal(url: string): Promise<boolean>;
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
    /** Deletes the campaign folder for good, closing the campaign first if it is open. */
    remove(campaignId: string): Promise<void>;
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
    /** A note without an id is new and goes last among its siblings (its folder, or the root). */
    save(note: Note): Promise<Note>;
    /**
     * Removes a note. For a folder, `contents` says what happens to what is inside: `lift`
     * (the default) moves it up a level, `delete` removes it too.
     */
    remove(noteId: string, contents?: NoteFolderContents): Promise<void>;
    /**
     * Puts a note (or folder) under `parentId` (null for the root) at `index` among the notes
     * there, renumbering that folder. Resolves to the whole list in tree order.
     */
    move(noteId: string, parentId: string | null, index: number): Promise<Note[]>;
  };
  /** Starting bodies for new notes, shared by every campaign in the Library (ADR 0010). */
  noteTemplates: {
    /** Seeds the session-prep template the first time a Library is asked. */
    list(): Promise<NoteTemplate[]>;
    /** A template without an id is new. */
    save(template: NoteTemplate): Promise<NoteTemplate>;
    remove(templateId: string): Promise<void>;
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
  backups: {
    list(): Promise<BackupInfo[]>;
    /** Writes a zip now, regardless of the daily schedule. */
    create(): Promise<BackupInfo | null>;
    /** Extracts a backup over the Library (after a safety zip) and reopens it. */
    restore(name: string): Promise<LibraryInfo>;
    openFolder(): Promise<void>;
  };
  music: {
    library(): Promise<MusicLibraryView>;
    /** Native folder picker; null when cancelled. */
    chooseFolder(): Promise<string | null>;
    /** Adds a folder and scans it; progress arrives as `musicScan` events. */
    addFolder(path: string): Promise<MusicLibraryView>;
    /** Forgets a folder and its tracks (files are never touched). */
    removeFolder(path: string): Promise<MusicLibraryView>;
    rescan(): Promise<MusicLibraryView>;
    updateTrack(trackId: string, patch: Partial<Track>): Promise<TrackView | null>;
    listPlaylists(): Promise<Playlist[]>;
    savePlaylist(playlist: Playlist): Promise<Playlist>;
    removePlaylist(playlistId: string): Promise<void>;
  };
  phoneAudio: {
    status(): Promise<PhoneAudioStatus>;
    /** Asks Windows for the paired phones that can send audio; takes a second or two. */
    listDevices(): Promise<PhoneAudioDevice[]>;
    /** Brings up the Bluetooth link and the audio connection; status arrives as events. */
    connect(device: PhoneAudioDevice): Promise<PhoneAudioStatus>;
    disconnect(): Promise<PhoneAudioStatus>;
    forget(deviceId: string): Promise<PhoneAudioStatus>;
    setSource(source: AudioSource): Promise<PhoneAudioStatus>;
  };
  homebrew: {
    /** Copies any record into the homebrew source with `basedOn` provenance (DESIGN.md §6.2). */
    duplicate(recordId: string): Promise<CompendiumRecord>;
    /** Validates, re-derives monster feature buttons from text, writes, and re-indexes. */
    save(record: CompendiumRecord): Promise<CompendiumRecord>;
    remove(recordId: string): Promise<void>;
  };
  icons: {
    /** The mapping tables from resources/icons/mapping.json. */
    tables(): Promise<IconTables>;
    /** Names of every bundled glyph; empty when the icon set was not fetched. */
    available(): Promise<string[]>;
    credits(): Promise<IconCreditsInfo | null>;
    /** Records a creature the tables could not match, in Library/logs/icon-misses.txt. */
    reportMiss(kind: string, name: string): Promise<void>;
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
  app: ['getInfo', 'openSystemPage', 'saveTextFile', 'openExternal'],
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
  campaigns: [
    'list',
    'create',
    'open',
    'current',
    'close',
    'update',
    'remove',
    'chooseXmlFile',
    'importXml',
  ],
  adventures: ['save', 'remove'],
  notes: ['save', 'remove', 'move'],
  noteTemplates: ['list', 'save', 'remove'],
  npcs: ['save', 'remove'],
  scenes: ['save', 'remove', 'importImage'],
  pcs: ['save', 'remove', 'quickAdd'],
  encounters: ['save', 'remove', 'saveState', 'finish'],
  backups: ['list', 'create', 'restore', 'openFolder'],
  music: [
    'library',
    'chooseFolder',
    'addFolder',
    'removeFolder',
    'rescan',
    'updateTrack',
    'listPlaylists',
    'savePlaylist',
    'removePlaylist',
  ],
  phoneAudio: ['status', 'listDevices', 'connect', 'disconnect', 'forget', 'setSource'],
  homebrew: ['duplicate', 'save', 'remove'],
  icons: ['tables', 'available', 'credits', 'reportMiss'],
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

/**
 * A modifier combo pressed inside a web tab's page (ADR 0011). The page keeps the key; the
 * console gets a copy so table-time hotkeys still fire while a web page has focus.
 */
export interface WebTabInput {
  key: string;
  control: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** Events pushed from main to a renderer without a request. */
export interface TrifoldEvents {
  presenterState: PresenterState;
  playerWindowChanged: { open: boolean };
  importProgress: ImportProgress;
  musicScan: MusicScanProgress;
  phoneAudioStatus: PhoneAudioStatus;
  webTabInput: WebTabInput;
}

export const EVENT_CHANNELS: { [E in keyof TrifoldEvents]: string } = {
  presenterState: 'trifold:event:presenter-state',
  playerWindowChanged: 'trifold:event:player-window-changed',
  importProgress: 'trifold:event:import-progress',
  musicScan: 'trifold:event:music-scan',
  phoneAudioStatus: 'trifold:event:phone-audio-status',
  webTabInput: 'trifold:event:web-tab-input',
};

/** What `window.trifold` actually is: the API plus an event subscription. */
export interface TrifoldBridge extends TrifoldApi {
  on<E extends keyof TrifoldEvents>(
    event: E,
    listener: (payload: TrifoldEvents[E]) => void,
  ): () => void;
}
