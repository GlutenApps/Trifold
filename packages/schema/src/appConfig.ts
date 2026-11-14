import { z } from 'zod';

/**
 * `<userData>/config.json`: app-level state that belongs to this computer rather than to any
 * Library. Which Library is open and which were opened recently, where the console window was,
 * the audio source and remembered phones (ADR 0007), and the second backup location (ADR 0015).
 */
export const APP_CONFIG_SCHEMA_VERSION = 1;

export const WindowBounds = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maximized: z.boolean().default(false),
});
export type WindowBounds = z.infer<typeof WindowBounds>;

export const AppConfig = z.object({
  schemaVersion: z.literal(APP_CONFIG_SCHEMA_VERSION),
  libraryPath: z.string().nullable().default(null),
  recentLibraries: z.array(z.string()).default([]),
  consoleWindow: WindowBounds.nullable().default(null),
  /** Where the table's music comes from (ADR 0007); the phone still connects by a click. */
  audioSource: z.enum(['computer', 'phone']).default('computer'),
  /** Phones connected through the audio receiver before (ADR 0007), most recent first. */
  phoneAudioDevices: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        lastConnectedAt: z.string(),
      }),
    )
    .default([]),
  /**
   * The second backup location (ADR 0015). Kept here, not in the Library: a drive letter or a
   * sync folder only means something on this computer.
   */
  backupCopy: z
    .object({
      folder: z.string().nullable().default(null),
      lastCopyAt: z.string().nullable().default(null),
      lastError: z.string().nullable().default(null),
    })
    .prefault({}),
  /**
   * The update check (ADR 0034), the one network feature the app starts by itself. Kept here,
   * not in a Library: it is this computer's choice. Off until the DM turns it on.
   */
  updates: z
    .object({
      /** The DM turned the daily check on. */
      enabled: z.boolean().default(false),
      /** The Library's one-time question was answered, either way. */
      asked: z.boolean().default(false),
      /** When the last check got an answer; a failed check leaves it as it was. */
      lastCheckAt: z.string().nullable().default(null),
      /** The newest release newer than the build that checked, from the last answer. */
      available: z
        .object({
          version: z.string(),
          name: z.string(),
          url: z.string(),
          publishedAt: z.string().nullable(),
        })
        .nullable()
        .default(null),
      /** The version the DM dismissed in the top bar; its button stays hidden. */
      dismissedVersion: z.string().nullable().default(null),
      /** The last check's failure, cleared by the next answer. */
      lastError: z.string().nullable().default(null),
    })
    .prefault({}),
});
export type AppConfig = z.infer<typeof AppConfig>;

export function defaultAppConfig(): AppConfig {
  return AppConfig.parse({ schemaVersion: APP_CONFIG_SCHEMA_VERSION });
}
