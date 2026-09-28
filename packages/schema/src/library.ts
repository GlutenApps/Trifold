import { z } from 'zod';
import { MusicSettings } from './music';

/** Majors: the stage's tabs (ADR 0004). One tab per kind, in at most two groups. */
/** Encounters holds the combat tracker while a fight runs (ADR 0005). */
export const MAJOR_KINDS = ['campaign', 'compendium', 'encounters', 'map'] as const;
export const MajorKind = z.enum(MAJOR_KINDS);
export type MajorKind = z.infer<typeof MajorKind>;

/** Minors: the dock's tools. Never on the stage. */
export const MINOR_KINDS = ['dice', 'tv', 'music', 'scenes', 'hotkeys', 'layouts'] as const;
export const MinorKind = z.enum(MINOR_KINDS);
export type MinorKind = z.infer<typeof MinorKind>;

export const StageGroup = z.object({
  tabs: z.array(MajorKind).default([]),
  active: MajorKind.nullable().default(null),
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

/** What a layout captures: chrome only, never what is live or playing (ADR 0004 §6). */
export const ShellLayout = z.object({
  stage: StageState,
  dock: DockState,
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
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

/** `Library/library.json` — settings for one Library folder. DESIGN.md §4.2. */
export const LIBRARY_SCHEMA_VERSION = 3;

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
});
export type LibrarySettings = z.infer<typeof LibrarySettings>;

export function defaultLibrarySettings(): LibrarySettings {
  return LibrarySettings.parse({ schemaVersion: LIBRARY_SCHEMA_VERSION });
}
