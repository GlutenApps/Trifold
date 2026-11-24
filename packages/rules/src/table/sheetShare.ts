import type { Character, PlayerSheet } from '@trifold/schema';

/**
 * Sharing a player's sheet with the GM's Trifold (ADR 0078): the character as the sheet shows
 * it, to read on the PC card. It is the one table message allowed past the ordinary 16 KiB cap,
 * up to this many bytes; the GM's table server closes a connection that sends more.
 */
export const SHEET_SHARE_BYTES = 256 * 1024;

/** What a sheet message may hold of the character: room is left for the message around it. */
const ROOM = SHEET_SHARE_BYTES - 1024;

/** The size of a value as JSON in UTF-8, which is how the socket counts it. */
export function jsonBytes(value: unknown): number {
  let n = 0;
  for (const ch of JSON.stringify(value)) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}
const bytes = jsonBytes;

/** The character without what stays with the player: the private notes and the builder's choices. */
export function playerSheetOf(character: Character): PlayerSheet {
  const { notes: _notes, build: _build, ...shared } = character;
  return shared;
}

/**
 * The sheet to share, made to fit: as it is when it fits; else without the text of features
 * that link to a compendium record (the GM's own compendium has it); else without any feature
 * text. Null when even that is too large.
 */
export function fitSheetShare(sheet: PlayerSheet): PlayerSheet | null {
  if (bytes(sheet) <= ROOM) return sheet;
  const features = sheet.sheet?.features;
  if (!sheet.sheet || !features) return null;
  const linkedOut: PlayerSheet = {
    ...sheet,
    sheet: { ...sheet.sheet, features: features.map((f) => (f.ref ? { ...f, text: '' } : f)) },
  };
  if (bytes(linkedOut) <= ROOM) return linkedOut;
  const allOut: PlayerSheet = {
    ...sheet,
    sheet: { ...sheet.sheet, features: features.map((f) => ({ ...f, text: '' })) },
  };
  return bytes(allOut) <= ROOM ? allOut : null;
}
