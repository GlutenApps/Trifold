import { z } from 'zod';
import { IsoDateTime } from './common';

export const NOTE_TEMPLATE_SCHEMA_VERSION = 1;

/**
 * A starting body for a new note (ADR 0010): `Library/templates/notes/<id>.json`, shared by every
 * campaign. The app seeds one session-prep outline the DM can edit or delete.
 */
export const NoteTemplate = z.object({
  schemaVersion: z.literal(NOTE_TEMPLATE_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  /** Markdown. */
  body: z.string().default(''),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type NoteTemplate = z.infer<typeof NoteTemplate>;
