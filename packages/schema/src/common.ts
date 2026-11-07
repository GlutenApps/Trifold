import { z } from 'zod';

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

/** The text of a thrown value, for banners and logs: an Error's message, else String(err). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function nowIso(): string {
  return new Date().toISOString();
}
