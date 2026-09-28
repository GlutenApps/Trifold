/** Field formats from DATA-FORMATS.md §2.2: ac, hp, speed, save, skill, type, lists, slots. */

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITIES)[number];

export function parseAc(text: string | undefined): { value: number; note?: string } | null {
  if (!text) return null;
  const m = /^\s*(\d+)\s*(?:\(([^)]*)\))?/.exec(text);
  if (!m?.[1]) return null;
  const note = m[2]?.trim();
  return note ? { value: Number(m[1]), note } : { value: Number(m[1]) };
}

export function parseHp(text: string | undefined): { average: number; formula?: string } | null {
  if (!text) return null;
  const m = /^\s*(\d+)\s*(?:\(([^)]*)\))?/.exec(text);
  if (!m?.[1]) return null;
  const formula = m[2]?.replace(/\s+/g, '').trim();
  return formula ? { average: Number(m[1]), formula } : { average: Number(m[1]) };
}

export interface ParsedSpeeds {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
  hover?: boolean;
  notes: string[];
  raw: string;
}

const SPEED_MODES = new Set(['walk', 'fly', 'swim', 'climb', 'burrow']);

/** `walk 30 ft., fly 60 ft. (hover), swim 20 ft.` or a bare `30 ft.` (= walk). */
export function parseSpeed(text: string | undefined): ParsedSpeeds {
  const raw = (text ?? '').trim();
  const result: ParsedSpeeds = { notes: [], raw };
  if (!raw) return result;
  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const m = /^(?:([A-Za-z]+)\s+)?(\d+)\s*(?:ft\.?|feet)?\s*(?:\(([^)]*)\))?/.exec(entry);
    if (!m?.[2]) {
      result.notes.push(entry);
      continue;
    }
    const mode = (m[1] ?? 'walk').toLowerCase();
    const value = Number(m[2]);
    const note = m[3]?.trim();
    if (SPEED_MODES.has(mode)) {
      result[mode as 'walk' | 'fly' | 'swim' | 'climb' | 'burrow'] = value;
    } else {
      result.notes.push(entry);
      continue;
    }
    if (note) {
      if (/^hover$/i.test(note)) result.hover = true;
      else result.notes.push(`${mode}: ${note}`);
    }
  }
  return result;
}

/** `Wis +6, Con +6, Dex +3` → `{ wis: 6, con: 6, dex: 3 }`. Unknown abilities are skipped. */
export function parseSaves(text: string | undefined): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  if (!text) return out;
  for (const part of text.split(',')) {
    const m = /^\s*([A-Za-z]{3})[a-z]*\s*([+-]?\s*\d+)/.exec(part);
    if (!m?.[1] || !m[2]) continue;
    const key = m[1].toLowerCase();
    if ((ABILITIES as readonly string[]).includes(key)) {
      out[key as AbilityKey] = Number(m[2].replace(/\s+/g, ''));
    }
  }
  return out;
}

/** `Perception +10, Stealth +6` → `{ Perception: 10, Stealth: 6 }` (names as written, trimmed). */
export function parseSkills(text: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!text) return out;
  for (const part of text.split(',')) {
    const m = /^\s*([A-Za-z][A-Za-z ']*?)\s*([+-]\s*\d+)\s*$/.exec(part);
    if (!m?.[1] || !m[2]) continue;
    out[m[1].trim()] = Number(m[2].replace(/\s+/g, ''));
  }
  return out;
}

/** `humanoid (goblinoid)` → type `humanoid`, subtype `goblinoid`. */
export function parseCreatureType(text: string | undefined): { type: string; subtype?: string } {
  const raw = (text ?? '').trim();
  const open = raw.indexOf('(');
  if (open === -1) return { type: raw.toLowerCase() };
  const type = raw.slice(0, open).trim().toLowerCase();
  const subtype = raw
    .slice(open + 1)
    .replace(/\)\s*$/, '')
    .trim();
  return subtype ? { type, subtype } : { type };
}

/**
 * Damage and condition lists: split on `;` and `,`, but keep qualified entries such as
 * `bludgeoning, piercing, and slashing from nonmagical attacks` as one entry.
 */
export function parseDamageList(text: string | undefined): string[] {
  const raw = (text ?? '').trim();
  if (!raw) return [];
  const out: string[] = [];
  for (const segment of raw.split(';')) {
    const s = segment.trim();
    if (!s) continue;
    if (/\b(from|that|while|except|during|unless)\b/i.test(s)) {
      out.push(s);
      continue;
    }
    for (const item of s.split(',')) {
      const entry = item.replace(/^\s*and\s+/i, '').trim();
      if (entry) out.push(entry);
    }
  }
  return out;
}

/** Plain comma lists (environment, spells, classes). */
export function parseCommaList(text: string | undefined): string[] {
  return (text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `0,4,3` → `[0, 4, 3]` (cantrips first, then slots per level; DATA-FORMATS.md §2.6). */
export function parseSlots(text: string | undefined): number[] | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;
  const values = raw.split(',').map((s) => Number(s.trim()));
  if (values.some((v) => !Number.isInteger(v) || v < 0)) return null;
  return values;
}

export function parseIntOrUndefined(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const m = /^\s*([+-]?\d+)/.exec(text);
  return m?.[1] ? Number(m[1]) : undefined;
}

export function parseNumberOrUndefined(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const m = /^\s*([+-]?\d+(?:\.\d+)?)/.exec(text);
  return m?.[1] ? Number(m[1]) : undefined;
}

export function parseYesNo(text: string | undefined): boolean {
  return /^\s*(yes|true|1)\s*$/i.test(text ?? '');
}
