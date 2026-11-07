import { z } from 'zod';

/** `<userData>/config.json` — app-level state that is not part of any Library (which Library is open, window bounds). */
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
});
export type AppConfig = z.infer<typeof AppConfig>;

export function defaultAppConfig(): AppConfig {
  return AppConfig.parse({ schemaVersion: APP_CONFIG_SCHEMA_VERSION });
}
