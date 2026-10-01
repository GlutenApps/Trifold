import { z } from 'zod';
import { IsoDateTime } from './common';

/** `Library/music/library.json` and `music/playlists/<id>.json` (DESIGN.md §5.3, DATA-FORMATS.md §5.5). */
export const MUSIC_SCHEMA_VERSION = 1;

export const TrackKind = z.enum(['music', 'ambience', 'sfx']);
export type TrackKind = z.infer<typeof TrackKind>;

export const Track = z.object({
  id: z.string().min(1),
  /** Absolute path; files are referenced in place, never copied or moved. */
  path: z.string().min(1),
  /** File size when last scanned; with the length, recognises a renamed or moved file. */
  sizeBytes: z.number().int().min(0).optional(),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  durationSec: z.number().min(0).default(0),
  /**
   * Gain to bring the track to the −16 LUFS target, measured in the background after a scan.
   * Null until measured; played at 0 dB meanwhile.
   */
  gainDb: z.number().nullable().default(null),
  tags: z.array(z.string()).default([]),
  loop: z.object({ startSec: z.number().min(0), endSec: z.number().min(0) }).optional(),
  kind: TrackKind.default('music'),
  addedAt: IsoDateTime,
});
export type Track = z.infer<typeof Track>;

export const MusicLibrary = z.object({
  schemaVersion: z.literal(MUSIC_SCHEMA_VERSION),
  folders: z.array(z.string()).default([]),
  tracks: z.array(Track).default([]),
  lastScanAt: IsoDateTime.nullable().default(null),
});
export type MusicLibrary = z.infer<typeof MusicLibrary>;

export const Playlist = z.object({
  schemaVersion: z.literal(MUSIC_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  trackIds: z.array(z.string()).default([]),
  shuffle: z.boolean().default(false),
  loop: z.boolean().default(true),
  /** Overrides the Library's crossfade duration for this playlist. */
  crossfadeSec: z.number().min(0).max(30).optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Playlist = z.infer<typeof Playlist>;

/** Player settings kept in `library.json` (DESIGN.md §6.6). */
export const MusicSettings = z.object({
  /** `MediaDeviceInfo.deviceId` of the output, or null for the system default. */
  outputDeviceId: z.string().nullable().default(null),
  masterVolume: z.number().min(0).max(1).default(0.8),
  musicVolume: z.number().min(0).max(1).default(0.8),
  ambienceVolume: z.number().min(0).max(1).default(0.6),
  sfxVolume: z.number().min(0).max(1).default(0.8),
  /** Crossfade for every music transition, 1–10 s (DESIGN.md §6.6). */
  crossfadeSec: z.number().min(1).max(10).default(4),
});
export type MusicSettings = z.infer<typeof MusicSettings>;

export function emptyMusicLibrary(): MusicLibrary {
  return { schemaVersion: MUSIC_SCHEMA_VERSION, folders: [], tracks: [], lastScanAt: null };
}
