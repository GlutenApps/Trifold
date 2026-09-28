import type { CompendiumQuery, CompendiumRow } from '@trifold/api';
import { crToNumber } from '@trifold/rules';
import type { CompendiumRecord } from '@trifold/schema';

/**
 * Pure helpers for the SQLite index: row columns, searchable text and SQL building.
 * Kept free of better-sqlite3 so they run under plain Node in unit tests (ADR 0001).
 */

export interface RecordColumns {
  id: string;
  kind: string;
  key: string;
  name: string;
  display_name: string;
  source_id: string;
  edition: string;
  cr: string | null;
  cr_num: number | null;
  type: string | null;
  size: string | null;
  environment: string | null;
  is_npc: number;
  level: number | null;
  type_code: string | null;
  rarity: string | null;
  json: string;
}

export function recordColumns(record: CompendiumRecord): RecordColumns {
  const base: RecordColumns = {
    id: record.id,
    kind: record.kind,
    key: record.key,
    name: record.name,
    display_name: record.displayName,
    source_id: record.sourceId,
    edition: record.edition,
    cr: null,
    cr_num: null,
    type: null,
    size: null,
    environment: null,
    is_npc: 0,
    level: null,
    type_code: null,
    rarity: null,
    json: JSON.stringify(record),
  };
  switch (record.kind) {
    case 'monster':
      base.cr = record.data.cr || null;
      base.cr_num = crToNumber(record.data.cr);
      base.type = record.data.type || null;
      base.size = record.data.size;
      base.environment = record.data.environment.length ? record.data.environment.join(', ') : null;
      base.is_npc = record.data.isNpc ? 1 : 0;
      break;
    case 'spell':
      base.level = record.data.level;
      base.type = record.data.school || null;
      break;
    case 'item':
      base.type_code = record.data.typeCode || null;
      base.rarity = record.data.rarity ?? null;
      break;
    default:
      break;
  }
  return base;
}

const MAX_TEXT = 20_000;

/** Everything worth full-text searching for one record, newline separated. */
export function indexText(record: CompendiumRecord): string {
  const parts: string[] = [record.displayName, record.name];
  switch (record.kind) {
    case 'monster': {
      const d = record.data;
      parts.push(
        d.type,
        d.subtype ?? '',
        d.alignment,
        d.senses,
        d.languages,
        d.environment.join(' '),
      );
      if (d.description) parts.push(d.description);
      for (const f of [
        ...d.traits,
        ...d.actions,
        ...d.bonusActions,
        ...d.reactions,
        ...d.legendary.actions,
        ...d.lair,
      ]) {
        parts.push(f.displayName, f.text);
      }
      if (d.spellcasting) parts.push(d.spellcasting.spells.join(' '));
      break;
    }
    case 'spell':
      parts.push(record.data.text, record.data.classes.join(' '));
      break;
    case 'item':
      parts.push(record.data.text, record.data.detail ?? '');
      break;
    case 'feat':
      parts.push(record.data.text, record.data.prerequisite ?? '');
      break;
    case 'species':
    case 'background':
      for (const t of record.data.traits) parts.push(t.name, t.text);
      break;
    case 'class':
      for (const level of record.data.levels) {
        for (const f of level.features) parts.push(f.name, f.text);
      }
      break;
  }
  return parts
    .filter((p) => p.length > 0)
    .join('\n')
    .slice(0, MAX_TEXT);
}

/** FTS5 MATCH expression: every whitespace-separated term as a quoted prefix, ANDed. */
export function buildFtsMatch(text: string | undefined): string | null {
  if (!text) return null;
  const terms = text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"*`);
  return terms.length > 0 ? terms.join(' ') : null;
}

export interface SearchSql {
  sql: string;
  countSql: string;
  params: unknown[];
  countParams: unknown[];
}

export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 2000;

export function buildSearch(query: CompendiumQuery): SearchSql {
  const where: string[] = ['r.kind = ?'];
  const params: unknown[] = [query.kind];
  const match = buildFtsMatch(query.text);
  const joins = ['JOIN sources s ON s.id = r.source_id'];

  if (match) {
    joins.push('JOIN records_fts f ON f.id = r.id');
    where.push('records_fts MATCH ?');
    params.push(match);
  }
  if (!query.includeDisabled) where.push('s.enabled = 1');
  if (query.sourceIds && query.sourceIds.length > 0) {
    where.push(`r.source_id IN (${query.sourceIds.map(() => '?').join(', ')})`);
    params.push(...query.sourceIds);
  }
  if (query.edition && query.edition !== 'all') {
    where.push('r.edition = ?');
    params.push(query.edition);
  }
  if (query.crMin !== undefined) {
    where.push('r.cr_num >= ?');
    params.push(query.crMin);
  }
  if (query.crMax !== undefined) {
    where.push('r.cr_num <= ?');
    params.push(query.crMax);
  }
  if (query.type) {
    where.push('r.type = ?');
    params.push(query.type.toLowerCase());
  }
  if (query.size) {
    where.push('r.size = ?');
    params.push(query.size);
  }
  if (query.environment) {
    where.push("(',' || r.environment || ',') LIKE ?");
    params.push(`%,${query.environment.toLowerCase()},%`);
  }
  if (query.npc === 'only') where.push('r.is_npc = 1');
  if (query.npc === 'exclude') where.push('r.is_npc = 0');
  if (query.level !== undefined) {
    where.push('r.level = ?');
    params.push(query.level);
  }

  const from = `FROM records r ${joins.join(' ')} WHERE ${where.join(' AND ')}`;
  const order = match
    ? 'ORDER BY bm25(records_fts), r.display_name COLLATE NOCASE, r.edition DESC'
    : 'ORDER BY r.display_name COLLATE NOCASE, r.edition DESC';
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(query.offset ?? 0, 0);

  return {
    sql: `SELECT r.id, r.kind, r.key, r.name, r.display_name, r.source_id, s.name AS source_name, r.edition, r.cr, r.type, r.size, r.environment, r.is_npc, r.level, r.type_code, r.rarity ${from} ${order} LIMIT ? OFFSET ?`,
    countSql: `SELECT COUNT(*) AS n ${from}`,
    params: [...params, limit, offset],
    countParams: params,
  };
}

export interface RawRow {
  id: string;
  kind: string;
  key: string;
  name: string;
  display_name: string;
  source_id: string;
  source_name: string;
  edition: string;
  cr: string | null;
  type: string | null;
  size: string | null;
  environment: string | null;
  is_npc: number;
  level: number | null;
  type_code: string | null;
  rarity: string | null;
}

export function toRow(raw: RawRow): CompendiumRow {
  return {
    id: raw.id,
    kind: raw.kind as CompendiumRow['kind'],
    key: raw.key,
    name: raw.name,
    displayName: raw.display_name,
    sourceId: raw.source_id,
    sourceName: raw.source_name,
    edition: raw.edition,
    cr: raw.cr,
    type: raw.type,
    size: raw.size,
    environment: raw.environment,
    isNpc: raw.is_npc === 1,
    level: raw.level,
    typeCode: raw.type_code,
    rarity: raw.rarity,
  };
}
