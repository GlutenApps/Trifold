import { z } from 'zod';
import { Edition, RecordKind } from './common';

/** One compendium entry. DESIGN.md §5.1. Kind-specific `data` shapes are added with the importers (M1). */
export const RECORD_SCHEMA_VERSION = 1;

export const RecordRef = z.object({
  recordId: z.string().min(1),
  sourceId: z.string().min(1),
  key: z.string(),
  edition: Edition,
});
export type RecordRef = z.infer<typeof RecordRef>;

export const RecordBase = z.object({
  schemaVersion: z.literal(RECORD_SCHEMA_VERSION),
  id: z.string().min(1),
  kind: RecordKind,
  /** `normalizeKey(name)` from @trifold/rules: lowercase, edition tags and punctuation stripped. */
  key: z.string(),
  name: z.string(),
  displayName: z.string(),
  sourceId: z.string().min(1),
  sourceBook: z.string().optional(),
  sourcePage: z.number().int().optional(),
  edition: Edition,
  tags: z.array(z.string()).default([]),
  basedOn: z.object({ recordId: z.string(), sourceId: z.string() }).optional(),
  data: z.record(z.string(), z.unknown()),
});
export type RecordBase = z.infer<typeof RecordBase>;
