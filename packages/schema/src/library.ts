import { z } from 'zod';
import { MusicSettings } from './music';

/**
 * The `library.json` settings schema (DESIGN.md §4.2): what one Library remembers between
 * launches, from the open campaign and the player display to the workspace layouts, web tabs
 * and backup settings. The shell types a layout is made of (majors, minors, stage, dock) live
 * here too because a saved layout is part of this file. `LibrarySettings` is near the end.
 */
/** Majors: the stage's tabs (ADR 0004). One tab per kind, in at most two groups. */
/** Encounters holds the combat tracker while a fight runs (ADR 0005). */
export const MAJOR_KINDS = ['campaign', 'compendium', 'encounters', 'map'] as const;
export const MajorKind = z.enum(MAJOR_KINDS);
export type MajorKind = z.infer<typeof MajorKind>;

/** Minors: the dock's tools, the tall ones. Never on the stage. Dice, Hotkeys and Layouts are
 *  pop-ups from their buttons (ADR 0009) and are not part of a layout. Quick notes joined the
 *  dock in ADR 0018; a layout saved without it gets it as a closed section. */
/** Also the dock's order, the same in every layout: Scenes, Music, Quick notes, Counters, Timers. */
export const MINOR_KINDS = ['scenes', 'music', 'quickNotes', 'counters', 'timers'] as const;
export const MinorKind = z.enum(MINOR_KINDS);
export type MinorKind = z.infer<typeof MinorKind>;

/**
 * Web tabs (ADR 0011): the DM's own browser tabs on the stage, each a saved URL that loads
 * again at launch. They live with the Library's workspace settings and are keyed on the stage
 * as `web:<id>`, beside the fixed majors.
 */
export const WEB_TAB_PREFIX = 'web:';
/** The Electron session every web tab shares; `persist:` keeps logins across launches. */
export const WEB_TAB_PARTITION = 'persist:web';
/** The marks a web tab can wear on the stage; none is shared with a tool. */
export const WEB_TAB_ICONS = [
  'globe',
  'tome',
  'person',
  'scroll',
  'quill',
  'crown',
  'potion',
  'coin',
  'compass',
  'skull',
  'gem',
  'star',
] as const;
export const WebTabIcon = z.enum(WEB_TAB_ICONS);
export type WebTabIcon = z.infer<typeof WebTabIcon>;

export const WebTab = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** The saved address, loaded at launch and by Home; http(s) only, the main process refuses
   *  anything else. It changes only when the DM edits the tab. */
  url: z.string().min(1),
  /** The title follows the page until the DM names the tab. */
  autoTitle: z.boolean().default(true),
  icon: WebTabIcon.default('globe'),
  /** Page zoom factor (1 = 100%), kept per tab and re-applied after every navigation. */
  zoom: z.number().min(0.25).max(5).default(1),
});
export type WebTab = z.infer<typeof WebTab>;

/** Only http(s) pages are hosted in a web tab or handed to the system browser. */
export function isWebUrl(url: string): boolean {
  // No URL class here: this package builds without the DOM lib. A scheme, a host, no spaces.
  return /^https?:\/\/[^\s/?#:]+(:\d+)?([/?#]\S*)?$/i.test(url.trim());
}

/** `example.com/page` → `https://example.com/page`; anything already schemed is left alone. */
export function normalizeWebUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  return isWebUrl(withScheme) ? withScheme : null;
}

export type WebTabKey = `${typeof WEB_TAB_PREFIX}${string}`;
/** A stage tab: a major, or a web tab by key. */
export type TabKey = MajorKind | WebTabKey;
export const TabKey = z.union([
  MajorKind,
  z.string().regex(/^web:.+/),
]) as unknown as z.ZodType<TabKey>;

export function isWebTabKey(key: string): key is WebTabKey {
  return key.startsWith(WEB_TAB_PREFIX);
}
export function isMajorKind(key: string): key is MajorKind {
  return (MAJOR_KINDS as readonly string[]).includes(key);
}
export function webTabKey(id: string): WebTabKey {
  return `${WEB_TAB_PREFIX}${id}`;
}
export function webTabId(key: WebTabKey): string {
  return key.slice(WEB_TAB_PREFIX.length);
}

export const StageGroup = z.object({
  tabs: z.array(TabKey).default([]),
  active: TabKey.nullable().default(null),
});
export type StageGroup = z.infer<typeof StageGroup>;

export const StageState = z.object({
  groups: z.array(StageGroup).min(1).max(2),
  /** Width share of the first group when there are two. */
  split: z.number().min(0.2).max(0.8).default(0.5),
  /** Index of the group filling the stage, or null. */
  maximized: z.number().int().min(0).max(1).nullable().default(null),
});
export type StageState = z.infer<typeof StageState>;

export const DockMode = z.enum(['wide', 'narrow', 'icons', 'hidden']);
export type DockMode = z.infer<typeof DockMode>;

export const DockSection = z.object({
  tool: MinorKind,
  open: z.boolean().default(false),
});
export type DockSection = z.infer<typeof DockSection>;

export const DockState = z.object({
  state: DockMode.default('wide'),
  width: z.number().min(200).max(800).default(400),
  /** The strip's order; every minor appears once. */
  sections: z.array(DockSection).default([]),
});
export type DockState = z.infer<typeof DockState>;

/**
 * What the live strip (the tray) shows besides Dice (ADR 0023): the VTT, Music and Encounters
 * sections, and single counters and timers of the open campaign by id. At most four; Dice is
 * always there and never counted.
 */
export const TRAY_SECTIONS = ['map', 'music', 'encounters'] as const;
export type TraySection = (typeof TRAY_SECTIONS)[number];
export type TrayItem = TraySection | `timer:${string}` | `counter:${string}`;
export const TRAY_MAX = 4;
export const DEFAULT_TRAY: readonly TrayItem[] = ['map', 'music', 'encounters'];

const TRAY_ITEM = /^(?:map|encounters|music|(?:timer|counter):[0-9A-Za-z]+)$/;
export function isTrayItem(value: unknown): value is TrayItem {
  return typeof value === 'string' && TRAY_ITEM.test(value);
}

/** Lenient: an item it does not know is dropped, as are repeats and anything past the fourth. */
const Tray = z
  .array(z.unknown())
  .transform((items): TrayItem[] => [...new Set(items.filter(isTrayItem))].slice(0, TRAY_MAX))
  .default([...DEFAULT_TRAY]);

/** What a layout captures: chrome only, never what is live or playing (ADR 0004 §6). */
export const ShellLayout = z.object({
  stage: StageState,
  dock: DockState,
  /** The tray's sections (ADR 0023); a layout saved before it gets today's tray. */
  tray: Tray,
});
export type ShellLayout = z.infer<typeof ShellLayout>;

export const WorkspacePreset = z.object({
  name: z.string().min(1),
  layout: ShellLayout,
});
export type WorkspacePreset = z.infer<typeof WorkspacePreset>;

export const WorkspaceSettings = z.object({
  /** The DM's named layouts, fully editable and app-wide. The starter set is copied in once. */
  presets: z.array(WorkspacePreset).default([]),
  seeded: z.boolean().default(false),
  /** Each campaign's console as it was left, by campaign slug. */
  consoles: z.record(z.string(), ShellLayout).default({}),
  /** The DM's saved web tabs (ADR 0011), Library-wide like the layouts. */
  webTabs: z.array(WebTab).default([]),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

/** `Library/library.json` — settings for one Library folder. DESIGN.md §4.2. */
export const LIBRARY_SCHEMA_VERSION = 5;

export const LibrarySettings = z.object({
  schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
  /** Bumped by the app when the derived SQLite index layout changes; a lower value forces a rebuild. */
  indexVersion: z.number().int().nonnegative().default(0),
  lastOpenCampaignSlug: z.string().nullable().default(null),
  theme: z.enum(['dark', 'light']).default('dark'),
  /** Electron display id the player window opens on. Null = pick the first non-primary display. */
  playerDisplayId: z.number().int().nullable().default(null),
  /** The only network feature, off by default (CLAUDE.md ground rule 1). */
  checkForUpdates: z.boolean().default(false),
  /**
   * Source book names whose records count as 2024 rules even without a `[5.5e]` suffix
   * (DATA-FORMATS.md §2.10). Applied at import time; user-configured, empty by default.
   */
  edition2024Books: z.array(z.string()).default([]),
  /** Bundled sources (srd-2024, srd-2014) the user switched off; other sources carry their own flag. */
  disabledSourceIds: z.array(z.string()).default([]),
  backups: z
    .object({
      enabled: z.boolean().default(true),
      keepDays: z.number().int().min(1).max(365).default(14),
    })
    .prefault({}),
  music: MusicSettings.prefault({}),
  workspace: WorkspaceSettings.prefault({}),
  /**
   * The bundled sample campaign (ADR 0016) is added once per Library; `added` records that it
   * was, so deleting it is final. Settings › Sample campaign adds it again on request.
   */
  sampleCampaign: z.object({ added: z.boolean().default(false) }).prefault({}),
});
export type LibrarySettings = z.infer<typeof LibrarySettings>;

export function defaultLibrarySettings(): LibrarySettings {
  return LibrarySettings.parse({ schemaVersion: LIBRARY_SCHEMA_VERSION });
}
