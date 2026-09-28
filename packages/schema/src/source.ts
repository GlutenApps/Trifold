import { z } from 'zod';
import { Edition, IsoDateTime, RecordKind } from './common';

/** `sources/<id>/source.json`. DATA-FORMATS.md §5.1, DESIGN.md §5.1. */
export const SOURCE_SCHEMA_VERSION = 1;

export const SourceKind = z.enum(['srd', 'xml', 'open5e', 'homebrew']);
export type SourceKind = z.infer<typeof SourceKind>;

export const SourceLicense = z.object({
  spdx: z.string().optional(),
  attribution: z.string().nullable().default(null),
  /** True when the source may contain content outside the SRD; exports of records derived from it warn. */
  nonSrd: z.boolean(),
});
export type SourceLicense = z.infer<typeof SourceLicense>;

export const Source = z.object({
  schemaVersion: z.literal(SOURCE_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  kind: SourceKind,
  filePath: z.string().optional(),
  fileHash: z.string().optional(),
  enabled: z.boolean().default(true),
  defaultEdition: Edition.default('2014'),
  edition2024Books: z.array(z.string()).default([]),
  license: SourceLicense,
  importedAt: IsoDateTime,
  recordCounts: z.partialRecord(RecordKind, z.number().int().nonnegative()).default({}),
  warnings: z.array(z.string()).default([]),
});
export type Source = z.infer<typeof Source>;
