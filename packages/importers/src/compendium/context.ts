import {
  extractSourceLine,
  normalizeKey,
  parseModifier,
  parseNameTags,
  resolveEdition,
} from '@trifold/rules';
import type { Edition, Modifier, Roll } from '@trifold/schema';
import { RECORD_SCHEMA_VERSION } from '@trifold/schema';
import { children, text, type XmlNode } from '../xml/tree';

export interface NormalizeContext {
  sourceId: string;
  defaultEdition: Edition;
  edition2024Books: readonly string[];
  newId(): string;
  /** Record-scoped warning sink; the importer prefixes the record's kind and name. */
  warn(message: string): void;
}

export interface RecordHeaderFields {
  schemaVersion: typeof RECORD_SCHEMA_VERSION;
  id: string;
  key: string;
  name: string;
  displayName: string;
  sourceId: string;
  sourceBook?: string;
  sourcePage?: number;
  edition: Edition;
  tags: string[];
}

/** Name tags, key, edition and citation for any record kind. */
export function makeHeader(
  ctx: NormalizeContext,
  rawName: string,
  source: { sourceBook?: string; sourcePage?: number },
): RecordHeaderFields {
  const parsed = parseNameTags(rawName);
  const header: RecordHeaderFields = {
    schemaVersion: RECORD_SCHEMA_VERSION,
    id: ctx.newId(),
    key: normalizeKey(parsed.displayName),
    name: rawName.trim(),
    displayName: parsed.displayName,
    sourceId: ctx.sourceId,
    edition: resolveEdition({
      is2024: parsed.is2024,
      sourceBook: source.sourceBook,
      edition2024Books: ctx.edition2024Books,
      defaultEdition: ctx.defaultEdition,
    }),
    tags: parsed.tags,
  };
  if (source.sourceBook) header.sourceBook = source.sourceBook;
  if (source.sourcePage !== undefined) header.sourcePage = source.sourcePage;
  return header;
}

/** Splits the trailing `Source:` line out of a text block. */
export function splitSource(body: string): {
  text: string;
  sourceBook?: string;
  sourcePage?: number;
} {
  const extracted = extractSourceLine(body);
  const out: { text: string; sourceBook?: string; sourcePage?: number } = { text: extracted.text };
  if (extracted.sourceBook) out.sourceBook = extracted.sourceBook;
  if (extracted.sourcePage !== undefined) out.sourcePage = extracted.sourcePage;
  return out;
}

export function readRolls(node: XmlNode): Roll[] {
  const out: Roll[] = [];
  for (const r of children(node, 'roll')) {
    const dice = r.text.replace(/\s+/g, '');
    if (!dice) continue;
    const roll: Roll = { dice };
    if (r.attrs['description']) roll.description = r.attrs['description'];
    const level = Number.parseInt(r.attrs['level'] ?? '', 10);
    if (Number.isFinite(level)) roll.level = level;
    out.push(roll);
  }
  return out;
}

export function readModifiers(node: XmlNode, ctx: NormalizeContext): Modifier[] {
  const out: Modifier[] = [];
  for (const m of children(node, 'modifier')) {
    const parsed = parseModifier(m.attrs['category'], m.text);
    if (parsed) out.push(parsed);
    else ctx.warn(`modifier "${m.text.trim()}" has no numeric value`);
  }
  return out;
}

export function requireName(node: XmlNode): string | null {
  const name = text(node, 'name');
  return name ? name : null;
}
