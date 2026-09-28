import { z } from 'zod';

/** `Library/library.json` — settings for one Library folder. DESIGN.md §4.2. */
export const LIBRARY_SCHEMA_VERSION = 1;

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
  backups: z
    .object({
      enabled: z.boolean().default(true),
      keepDays: z.number().int().min(1).max(365).default(14),
    })
    .prefault({}),
});
export type LibrarySettings = z.infer<typeof LibrarySettings>;

export function defaultLibrarySettings(): LibrarySettings {
  return LibrarySettings.parse({ schemaVersion: LIBRARY_SCHEMA_VERSION });
}
