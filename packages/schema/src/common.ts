import { z } from 'zod';

/** Crockford base32, 26 chars. Generated ids use ULIDs; bundled SRD ids may use other stable strings. */
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const Ulid = z.string().regex(ULID_RE, 'expected a ULID');

/** ISO 8601 date-time. On disk we always write UTC (`Date#toISOString`). */
export const IsoDateTime = z.iso.datetime({ offset: true });

export const Edition = z.enum(['2024', '2014', 'unknown']);
export type Edition = z.infer<typeof Edition>;

export const RecordKind = z.enum([
  'monster',
  'spell',
  'item',
  'feat',
  'species',
  'background',
  'class',
]);
export type RecordKind = z.infer<typeof RecordKind>;

export const Ability = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type Ability = z.infer<typeof Ability>;

export const Timestamps = z.object({
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Timestamps = z.infer<typeof Timestamps>;

export function nowIso(): string {
  return new Date().toISOString();
}
