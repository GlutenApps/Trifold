import type {
  Adventure,
  Campaign,
  CampaignCounter,
  CampaignExportOptions,
  CampaignTimer,
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
  PinnedRoll,
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

/** A display from Electron's `screen`; `id` is what `LibrarySettings.playerDisplayId` stores. */
export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
  isInternal: boolean;
}

/**
 * The search index's state: when `ok` is false, searches fail with `error` while the files still
 * work.
 */
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
  /** The counters the DM put on the TV (ADR 0019). */
  counters: boolean;
  /** The timer the DM put on the TV (ADR 0021). */
  timers: boolean;
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

/** A counter on the TV (ADR 0019): at most three, in the DM's order. */
export interface LiveCounter {
  id: string;
  name: string;
  value: number;
  /** Shown as "value / max" when set. */
  max?: number;
  /** The bound it sits on, if any. */
  bound: 'min' | 'max' | null;
}

/**
 * A timer on the TV (ADR 0021). The player counts down from `endsAt` on its own clock, so the
 * console only sends a change when the timer is started, paused, reset or edited.
 */
export interface LiveTimer {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'done';
  /** Milliseconds since the epoch when a running timer reaches zero. */
  endsAt?: number;
  /** Time left when not running. */
  leftMs: number;
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
  /** The counters marked Show on TV, in list order (ADR 0019). */
  counters: LiveCounter[];
  /** The one timer marked Show on TV, or null (ADR 0021). */
  timer: LiveTimer | null;
  /** Milliseconds since epoch; lets the player ignore stale updates. */
  updatedAt: number;
}

export const initialPresenterState: PresenterState = {
  schemaVersion: 1,
  blackout: true,
  scene: null,
  showSceneTitle: true,
  overlays: {
    sceneTitle: true,
    initiativeStrip: true,
    pcHealthBars: false,
    roundCounter: true,
    counters: true,
    timers: true,
  },
  handout: null,
  breakScreen: null,
  combat: null,
  counters: [],
  timer: null,
  updatedAt: 0,
};

// ---------- backups (DESIGN.md §4.2, CLAUDE.md ground rule 6) ----------

export interface BackupInfo {
  /** File name inside Library/backups. */
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: 'daily' | 'manual' | 'quit' | 'preRestore';
}

/** `manifest.json` at the root of every backup zip and campaign export (ADR 0015). */
export interface BackupManifest {
  kind: 'library' | 'campaign';
  appVersion: string;
  librarySchemaVersion: number;
  campaignSchemaVersion: number;
  createdAt: string;
  counts: { campaigns: number; homebrew: number; sources: number };
  /** Campaign exports: which campaign, and how it was exported. */
  campaign?: { id: string; name: string; pcs: number; options: CampaignExportOptions };
}

/** A zip picked with Restore from file, read before anything is changed. */
export interface BackupFileInfo {
  path: string;
  name: string;
  sizeBytes: number;
  /** Null for a zip made before manifests (it restores as before). */
  manifest: BackupManifest | null;
  /** Why it cannot be restored (made by a newer Trifold, not a Library backup); null when it can. */
  problem: string | null;
}

/** The second backup location (ADR 0015). */
export interface BackupCopyStatus {
  /** The folder the DM chose; null when copying is off. */
  folder: string | null;
  /** Where this Library's zips land inside it. */
  target: string | null;
  lastCopyAt: string | null;
  /** The last copy's failure, cleared by the next success. */
  lastError: string | null;
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

/**
 * A file inside `campaigns/<slug>/` (a scene image, token art), served by main from the open
 * Library.
 */
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
  /**
   * Imported files only (ADR 0028): the books the file names, and per kind how many names
   * appear twice from different books with nothing marking which copy is 2024 rules.
   */
  review?: {
    books: Array<{ name: string; records: number }>;
    duplicates: Partial<Record<string, number>>;
  };
}

/** One attribution block for the About page (DESIGN.md §6.1). */
export interface AttributionEntry {
  sourceId: string;
  name: string;
  statement: string;
  licenses: Array<{ key: string; name: string; text: string }>;
  permalink: string;
}

/**
 * Compendium import phases, in order; `bytesRead` counts the hash pass, then starts over for
 * parsing.
 */
export interface ImportProgress {
  phase: 'hashing' | 'copying' | 'parsing' | 'writing' | 'indexing' | 'done';
  records: number;
  bytesRead: number;
  totalBytes: number;
}

export interface ImportReport {
  sourceId: string;
  name: string;
  /**
   * `unchanged`: same file hash and current importer, nothing written. `updated`: an existing
   * source re-parsed, with `diff`. `imported`: a new source.
   */
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
  /**
   * The other records behind a collapsed row, highest-priority source first (ADR 0027): the
   * list's "+" says they exist. Empty when the row stands alone or collapsing is off.
   */
  otherVersions: Array<{ sourceName: string; edition: string }>;
  cr: string | null;
  type: string | null;
  size: string | null;
  environment: string | null;
  isNpc: boolean;
  level: number | null;
  typeCode: string | null;
  rarity: string | null;
}

/** One global-search hit from the compendium (ADR 0017): a row plus how its name matched. */
export interface CompendiumSuggestion extends CompendiumRow {
  tier: 'exact' | 'prefix' | 'word' | 'substring';
}

/** A record whose text holds the phrase (ADR 0017): a row plus the phrase in context. */
export interface CompendiumTextHit extends CompendiumRow {
  snippet: { before: string; match: string; after: string };
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
  /** The Counters dock tool's counters, in list order (ADR 0019). */
  counters: CampaignCounter[];
  /** The Timers dock tool's timers (definitions only), in list order (ADR 0021). */
  timers: CampaignTimer[];
  /** Rolls pinned from the roll log, in the order they were pinned. */
  pinnedRolls: PinnedRoll[];
}

/** What `notes.remove` does with a folder's contents: move it up a level, or remove it too. */
export type NoteFolderContents = 'lift' | 'delete';

/** What an export with these options would carry and leave out (ADR 0015). */
export interface CampaignExportPreview {
  pcs: number;
  homebrew: number;
  /** Records from sources the DM imported: referenced, never bundled. */
  importedRecords: number;
}

/** A `.trifold-campaign` file picked for import, read before anything is written. */
export interface CampaignPackageInfo {
  path: string;
  name: string;
  sizeBytes: number;
  manifest: BackupManifest | null;
  /** The campaign in this Library with the same id; the DM picks Replace or Import as a copy. */
  existing: CampaignSummary | null;
  /** Why it cannot be imported; null when it can. */
  problem: string | null;
}

/** `new` when the Library has no such campaign; otherwise `replace` it or import a `copy`. */
export type CampaignPackageMode = 'new' | 'replace' | 'copy';

export interface CampaignPackageResult {
  campaign: CampaignSummary;
  mode: CampaignPackageMode;
  homebrewAdded: number;
  /** Homebrew already in this Library with different content; the Library's version was kept. */
  homebrewKept: number;
  /** Records the campaign refers to that this Library does not have. */
  unresolved: number;
  /** The backup written before a Replace. */
  safety: string | null;
}

/** The bundled sample campaign (ADR 0016), as Settings › Sample campaign shows it. */
export interface SampleCampaignStatus {
  /** False when this build has no sample (a dev checkout that never built it). */
  available: boolean;
  /** True when this Library has it (by the campaign id the sample ships with). */
  present: boolean;
  name: string | null;
}

export interface CampaignImportReport {
  campaignId: string;
  name: string;
  /** `new` created a campaign named after the file; `merge` added to the open campaign. */
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
    /** Opens an http(s) URL in the system browser (ADR 0011); false for any other scheme. */
    openExternal(url: string): Promise<boolean>;
    /** The console's answer to a `flushSaves` event: every pending save has been written. */
    savesFlushed(): Promise<void>;
  };
  library: {
    getInfo(): Promise<LibraryInfo>;
    /** Native folder picker. Resolves to null when cancelled. */
    chooseFolder(): Promise<string | null>;
    /** Opens (creating the layout if needed) and switches the app to that Library. */
    open(path: string): Promise<LibraryInfo>;
    openInExplorer(): Promise<void>;
    /**
     * Shallow merge into `library.json`: a nested object such as `workspace` replaces the whole
     * object.
     */
    updateSettings(patch: Partial<LibrarySettings>): Promise<LibrarySettings>;
  };
  displays: {
    list(): Promise<DisplayInfo[]>;
  };
  player: {
    /**
     * Opens the TV window on `displayId`; undefined or null means the Library's saved display,
     * then the first non-primary display, then the primary. An open window is moved instead.
     */
    open(displayId?: number | null): Promise<void>;
    close(): Promise<void>;
    isOpen(): Promise<boolean>;
  };
  presenter: {
    /**
     * The console's state, relayed to the player; a push with an older `updatedAt` than the last is
     * ignored.
     */
    push(state: PresenterState): Promise<void>;
    /** The last pushed state; the player window calls it on load so it starts live. */
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
    /**
     * Saves which of an imported file's books use 2024 rules and re-parses it from its stored
     * original.xml, keeping record ids (ADR 0028).
     */
    setEdition2024Books(sourceId: string, books: string[]): Promise<ImportReport>;
    /**
     * Switches a source in or out of search; bundled sources are recorded in `disabledSourceIds`,
     * imported ones in their `source.json`. Resolves to the updated source.
     */
    setEnabled(sourceId: string, enabled: boolean): Promise<Source>;
    /**
     * Deletes `sources/<id>/` (original.xml and records) and its index rows; refuses bundled
     * sources.
     */
    remove(sourceId: string): Promise<void>;
    /** Clears the index and re-reads every source's records from disk. */
    rebuildIndex(): Promise<IndexStats>;
    /** License statements for bundled content, always shown in About. */
    attribution(): Promise<AttributionEntry[]>;
  };
  campaigns: {
    list(): Promise<CampaignSummary[]>;
    /**
     * Creates `campaigns/<slug>/`, opens the campaign and resolves to its bundle. A blank name
     * throws.
     */
    create(name: string): Promise<CampaignBundle>;
    /**
     * Makes it the open campaign, remembered in `library.json` for next launch. Accepts an id or a
     * slug.
     */
    open(campaignId: string): Promise<CampaignBundle>;
    /** The campaign opened last time, reopened on start; null when none. */
    current(): Promise<CampaignBundle | null>;
    /**
     * Every campaign's bundle, read without opening any: what the Library's search looks in.
     * A campaign that cannot be read is left out and logged.
     */
    bundles(): Promise<CampaignBundle[]>;
    /** Forgets the open campaign; nothing in its folder changes. */
    close(): Promise<void>;
    /** Shallow patch of `campaign.json`; `id` and `slug` cannot change, `updatedAt` is set. */
    update(patch: Partial<Campaign>): Promise<Campaign>;
    /** Deletes the campaign folder for good, closing the campaign first if it is open. */
    remove(campaignId: string): Promise<void>;
    /** Native file picker for campaign XML. Resolves to null when cancelled. */
    chooseXmlFile(): Promise<string | null>;
    /** Imports a Game Master 5e campaign XML or a Fight Club 5e GM export (DATA-FORMATS.md §3). */
    importXml(path: string, mode: 'new' | 'merge'): Promise<CampaignImportReport>;
    /** Counts what an export with these options would carry, writing nothing. */
    exportPreview(
      campaignId: string,
      options: CampaignExportOptions,
    ): Promise<CampaignExportPreview>;
    /** Native save dialog, then writes `<name>.trifold-campaign`; null when cancelled. */
    exportTo(campaignId: string, options: CampaignExportOptions): Promise<string | null>;
    /** Native picker for a `.trifold-campaign`; read but not imported. Null when cancelled. */
    choosePackage(): Promise<CampaignPackageInfo | null>;
    /**
     * Writes the package's campaign under `mode` (`replace` writes a safety backup first, `copy`
     * gives everything new ids), adds homebrew the Library lacks and re-indexes when it did.
     */
    importPackage(path: string, mode: CampaignPackageMode): Promise<CampaignPackageResult>;
    /** Whether this build has the sample campaign and whether this Library has it (ADR 0016). */
    sample(): Promise<SampleCampaignStatus>;
    /**
     * Adds the sample campaign, or replaces it with the shipped copy when it is there (a
     * safety backup is written first). Every Library is also given it once when it opens.
     */
    addSample(): Promise<CampaignPackageResult>;
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
    /**
     * Saves a quick note (ADR 0018) into the Quick Notes folder, creating the folder at the end
     * of the root first when the campaign has none (or the DM deleted it). The title must not
     * be blank. Resolves to the note and the folder it went into.
     */
    capture(input: { title: string; body: string }): Promise<{ note: Note; folder: Note }>;
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
    /** An id-less NPC is created; otherwise its file is replaced. `updatedAt` is set either way. */
    save(npc: NPC): Promise<NPC>;
    remove(npcId: string): Promise<void>;
  };
  pcs: {
    /**
     * An id-less card is created; otherwise its file is replaced. `updatedAt` is set either way.
     */
    save(pc: PCCard): Promise<PCCard>;
    remove(pcId: string): Promise<void>;
    /** One PC per line: `Name, Player, Class L, HP, AC, Init, Speed, PP`. */
    quickAdd(text: string): Promise<PCCard[]>;
  };
  encounters: {
    /**
     * An id-less encounter is created; otherwise its file is replaced. `updatedAt` is set either
     * way.
     */
    save(encounter: Encounter): Promise<Encounter>;
    remove(encounterId: string): Promise<void>;
    /** Autosave of live combat; null clears it. */
    saveState(encounterId: string, state: CombatState | null): Promise<Encounter>;
    /**
     * Ends the fight: PC cards and named NPCs get their HP written back (ADR 0012), the live
     * state is cleared and `result` is appended to the encounter's results.
     */
    finish(encounterId: string, result: EncounterResult): Promise<Encounter>;
  };
  scenes: {
    /**
     * An id-less scene is created; otherwise its file is replaced. `updatedAt` is set either way.
     */
    save(scene: Scene): Promise<Scene>;
    /**
     * Deletes the one scene file; a folder's children and the scene's image files are left as they
     * are.
     */
    remove(sceneId: string): Promise<void>;
    /** Native picker; copies the image into the campaign and makes a display-size copy. */
    importImage(): Promise<SceneImage | null>;
  };
  /** The open campaign's counters (ADR 0019), one file each under `counters/`. */
  counters: {
    /**
     * An id-less counter is created and goes last; otherwise its file is replaced. The value is
     * clamped to the counter's bounds and `updatedAt` is set either way.
     */
    save(counter: CampaignCounter): Promise<CampaignCounter>;
    remove(counterId: string): Promise<void>;
    /**
     * Puts a counter at `index` among the others and renumbers them from 0. Resolves to every
     * counter in list order.
     */
    move(counterId: string, index: number): Promise<CampaignCounter[]>;
  };
  /** The open campaign's timer definitions (ADR 0021), one file each under `timers/`. */
  timers: {
    /** An id-less timer is created and goes last; otherwise its file is replaced. */
    save(timer: CampaignTimer): Promise<CampaignTimer>;
    remove(timerId: string): Promise<void>;
    /** Puts a timer at `index` and renumbers the list; resolves to every timer in order. */
    move(timerId: string, index: number): Promise<CampaignTimer[]>;
  };
  /** The open campaign's pinned rolls, one file each under `pinnedRolls/`. */
  pinnedRolls: {
    /** An id-less pin is created; otherwise its file is replaced (a rename). */
    save(pin: PinnedRoll): Promise<PinnedRoll>;
    remove(pinId: string): Promise<void>;
  };
  backups: {
    list(): Promise<BackupInfo[]>;
    /** Writes a zip now, regardless of the daily schedule. */
    create(): Promise<BackupInfo | null>;
    /** Replaces the Library with a backup (after a safety zip) and reopens it. */
    restore(name: string): Promise<LibraryInfo>;
    openFolder(): Promise<void>;
    /** Native picker for a backup zip anywhere; read but not restored. Null when cancelled. */
    chooseFile(): Promise<BackupFileInfo | null>;
    /** Like `restore`, from a zip anywhere on disk. */
    restoreFile(path: string): Promise<LibraryInfo>;
    copyStatus(): Promise<BackupCopyStatus>;
    /** Native folder picker; every later backup is also copied there. Unchanged when cancelled. */
    chooseCopyFolder(): Promise<BackupCopyStatus>;
    stopCopying(): Promise<BackupCopyStatus>;
  };
  music: {
    library(): Promise<MusicLibraryView>;
    /** Native folder picker; null when cancelled. */
    chooseFolder(): Promise<string | null>;
    /** Adds a folder and scans it; progress arrives as `musicScan` events. */
    addFolder(path: string): Promise<MusicLibraryView>;
    /** Forgets a folder and its tracks (files are never touched). */
    removeFolder(path: string): Promise<MusicLibraryView>;
    /**
     * Walks every folder again: new files added, moved files relinked, gone files dropped
     * (DATA-FORMATS.md §5.5).
     */
    rescan(): Promise<MusicLibraryView>;
    /**
     * Patches tags, kind, gain and trims; `id`, `path` and `addedAt` are ignored. Null for an
     * unknown track.
     */
    updateTrack(trackId: string, patch: Partial<Track>): Promise<TrackView | null>;
    listPlaylists(): Promise<Playlist[]>;
    /** An id-less playlist is created; otherwise its file is replaced. */
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
    /** Drops a remembered phone, disconnecting first when it is the connected one. */
    forget(deviceId: string): Promise<PhoneAudioStatus>;
    /** Records which player the table hears (per machine, in config.json); connects nothing. */
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
    /** Null when the icon set was not fetched at build time (no credits.json). */
    credits(): Promise<IconCreditsInfo | null>;
    /** Records a creature the tables could not match, in Library/logs/icon-misses.txt. */
    reportMiss(kind: string, name: string): Promise<void>;
  };
  compendium: {
    /** Rows from enabled sources unless `includeDisabled`; see `CompendiumQuery` for collapsing. */
    search(query: CompendiumQuery): Promise<CompendiumSearchResult>;
    /** Any record by id, from an enabled or a disabled source; null when unknown. */
    get(recordId: string): Promise<CompendiumRecord | null>;
    /** Every edition of a record sharing one key, across enabled sources. */
    findByKey(kind: RecordKind, key: string): Promise<CompendiumRecord[]>;
    /** Distinct types, sizes and environments of a kind across enabled sources. */
    facets(kind: RecordKind): Promise<CompendiumFacets>;
    /**
     * Records of every enabled kind whose display name contains `text`, best match first, with
     * editions collapsed (ADR 0017, global search). Name only; no body text.
     */
    suggest(
      text: string,
      opts?: { limit?: number; preferEdition?: '2024' | '2014' },
    ): Promise<CompendiumSuggestion[]>;
    /**
     * Records of every enabled kind whose text holds `text` as a phrase and whose name does
     * not, best match first, editions collapsed, each with a snippet (ADR 0017, global search).
     */
    searchText(
      text: string,
      opts?: { limit?: number; preferEdition?: '2024' | '2014' },
    ): Promise<CompendiumTextHit[]>;
  };
}

export type ApiNamespace = keyof TrifoldApi;

/** Every method, by namespace. The preload and the IPC registry iterate this table. */
export const API_METHODS = {
  app: ['getInfo', 'openSystemPage', 'openExternal', 'savesFlushed'],
  library: ['getInfo', 'chooseFolder', 'open', 'openInExplorer', 'updateSettings'],
  displays: ['list'],
  player: ['open', 'close', 'isOpen'],
  presenter: ['push', 'get'],
  sources: [
    'list',
    'chooseFile',
    'importFile',
    'reimport',
    'setEdition2024Books',
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
    'bundles',
    'close',
    'update',
    'remove',
    'chooseXmlFile',
    'importXml',
    'exportPreview',
    'exportTo',
    'choosePackage',
    'importPackage',
    'sample',
    'addSample',
  ],
  notes: ['save', 'remove', 'move', 'capture'],
  noteTemplates: ['list', 'save', 'remove'],
  npcs: ['save', 'remove'],
  scenes: ['save', 'remove', 'importImage'],
  counters: ['save', 'remove', 'move'],
  timers: ['save', 'remove', 'move'],
  pinnedRolls: ['save', 'remove'],
  pcs: ['save', 'remove', 'quickAdd'],
  encounters: ['save', 'remove', 'saveState', 'finish'],
  backups: [
    'list',
    'create',
    'restore',
    'openFolder',
    'chooseFile',
    'restoreFile',
    'copyStatus',
    'chooseCopyFolder',
    'stopCopying',
  ],
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
  compendium: ['search', 'get', 'findByKey', 'facets', 'suggest', 'searchText'],
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
  /** The console is closing: write every save still waiting on a timer, then call `app.savesFlushed`. */
  flushSaves: Record<string, never>;
  /** A copy to the second backup location finished or failed. */
  backupCopy: BackupCopyStatus;
}

export const EVENT_CHANNELS: { [E in keyof TrifoldEvents]: string } = {
  presenterState: 'trifold:event:presenter-state',
  playerWindowChanged: 'trifold:event:player-window-changed',
  importProgress: 'trifold:event:import-progress',
  musicScan: 'trifold:event:music-scan',
  phoneAudioStatus: 'trifold:event:phone-audio-status',
  webTabInput: 'trifold:event:web-tab-input',
  flushSaves: 'trifold:event:flush-saves',
  backupCopy: 'trifold:event:backup-copy',
};

/** What `window.trifold` actually is: the API plus an event subscription. */
export interface TrifoldBridge extends TrifoldApi {
  on<E extends keyof TrifoldEvents>(
    event: E,
    listener: (payload: TrifoldEvents[E]) => void,
  ): () => void;
}
