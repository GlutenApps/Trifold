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

/**
 * The `records` row for one record: the shared columns plus the filter columns its kind has
 * (monsters: cr, type, size, environment, npc; spells: level, and school as `type`; items: type
 * code and rarity). The whole record goes into `json` so lists never read from disk.
 */
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
    case 'condition':
      parts.push(record.data.text);
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

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

/**
 * The search SQL for a `CompendiumQuery`: `sql` and `params` for the page of rows, `countSql`
 * and `countParams` for the total. By default records sharing a key (the 2024 and legacy
 * Goblin, or one monster from two sources) collapse to a single row headed by the record from
 * the highest-priority source (ADR 0027), `preferEdition` breaking ties inside one source,
 * which needs a window function, and bm25() ranking only works in the inner query, never beside
 * that window function; hence the nested shape. `collapse: false` returns every record.
 */
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
  where.push(CAMPAIGN_FILTER);
  params.push(query.campaignSourceId ?? '');
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
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(query.offset ?? 0, 0);

  // Records sharing a key (the 2024 and legacy Goblin, or the same monster from two sources)
  // collapse to one row (DESIGN.md §7.2). The plain inner query filters and scores (bm25 only
  // works at that level, never beside a window function); the middle one ranks each key's
  // records, highest-priority source first, then the preferred edition, and gathers every
  // edition and every version (source and edition) behind the row; the outer one
  // keeps rank 1. The `?` in the middle SELECT list binds first, before the WHERE params.
  const rank = match ? 'bm25(records_fts)' : '0';
  const base = `SELECT r.id, r.kind, r.key, r.name, r.display_name, r.source_id, s.name AS source_name, s.priority AS source_priority, r.edition, r.cr, r.type, r.size, r.environment, r.is_npc, r.level, r.type_code, r.rarity, CASE WHEN s.kind = 'campaign' THEN r.source_id || char(31) || r.key ELSE r.key END AS group_key, ${rank} AS rank ${from}`;
  if (query.collapse === false) {
    const plainOrder = match
      ? 'ORDER BY rank, r.display_name COLLATE NOCASE, r.edition DESC'
      : 'ORDER BY r.display_name COLLATE NOCASE, r.edition DESC';
    return {
      sql: `${base} ${plainOrder} LIMIT ? OFFSET ?`,
      countSql: `SELECT COUNT(*) AS n ${from}`,
      params: [...params, limit, offset],
      countParams: params,
    };
  }
  const ranked = `SELECT *, ROW_NUMBER() OVER (PARTITION BY group_key ORDER BY source_priority, (edition = ?) DESC, edition DESC, source_name COLLATE NOCASE, id) AS rn, GROUP_CONCAT(edition) OVER (PARTITION BY group_key) AS editions, GROUP_CONCAT(source_priority || char(31) || source_name || char(31) || edition, char(30)) OVER (PARTITION BY group_key) AS versions FROM (${base})`;
  const order = match
    ? 'ORDER BY rank, display_name COLLATE NOCASE, edition DESC'
    : 'ORDER BY display_name COLLATE NOCASE, edition DESC';

  return {
    sql: `SELECT * FROM (${ranked}) WHERE rn = 1 ${order} LIMIT ? OFFSET ?`,
    countSql: `SELECT COUNT(DISTINCT CASE WHEN s.kind = 'campaign' THEN r.source_id || char(31) || r.key ELSE r.key END) AS n ${from}`,
    params: [query.preferEdition ?? '2024', ...params, limit, offset],
    countParams: params,
  };
}

/** The distinct editions behind a collapsed row, the row's own first, then newest first. */
export function parseEditions(own: string, concatenated: string | null): string[] {
  const rest = new Set((concatenated ?? '').split(',').filter((e) => e && e !== own));
  return [own, ...[...rest].sort().reverse()];
}

/**
 * The other versions behind a collapsed row (ADR 0027), highest priority first: every
 * source-and-edition pair except the row's own. `versions` is the GROUP_CONCAT of
 * `priority \x1f source name \x1f edition`, joined by `\x1e`.
 */
export function parseVersions(
  ownSource: string,
  ownEdition: string,
  versions: string | null,
): Array<{ sourceName: string; edition: string }> {
  if (!versions) return [];
  const all = versions
    .split('\u001e')
    .map((v) => v.split('\u001f'))
    .filter((p): p is [string, string, string] => p.length === 3)
    .map(([priority, sourceName, edition]) => ({ priority: Number(priority), sourceName, edition }))
    .sort((a, b) => a.priority - b.priority || b.edition.localeCompare(a.edition));
  let ownSkipped = false;
  const out: Array<{ sourceName: string; edition: string }> = [];
  for (const v of all) {
    if (!ownSkipped && v.sourceName === ownSource && v.edition === ownEdition) {
      ownSkipped = true;
      continue;
    }
    out.push({ sourceName: v.sourceName, edition: v.edition });
  }
  return out;
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
  /** Comma-joined editions of every record behind the row (GROUP_CONCAT); absent uncollapsed. */
  editions?: string | null;
  /** Every record behind the row as priority, source name and edition (GROUP_CONCAT). */
  versions?: string | null;
}

/** A `CompendiumRow` from a raw result row; `editions` is expanded from the GROUP_CONCAT column. */
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
    editions: parseEditions(raw.edition, raw.editions ?? null),
    otherVersions: parseVersions(raw.source_name, raw.edition, raw.versions ?? null),
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

/**
 * Campaign creatures (ADR 0035) show only for the open campaign; `openCampaign` is its source id,
 * or null when none is open. Binds one parameter.
 */
const CAMPAIGN_FILTER = "(s.kind != 'campaign' OR r.source_id = ?)";

/** `text` as a LIKE pattern body: its own `%`, `_` and `\` escaped (ESCAPE '\\'). */
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const SUGGEST_LIMIT = 100;

/**
 * The global search's compendium half (ADR 0017): records of every kind whose display name
 * contains `text`, ranked by the same tiers as `rankByName` in @trifold/rules (exact 0, prefix
 * 1, start of a later word 2, anywhere 3), then by name. Records sharing a kind and key collapse
 * to one row headed by `preferEdition`, as `buildSearch` does. Only enabled sources answer.
 * LIKE is case-insensitive for ASCII in SQLite; the `?` placeholders bind in order: the
 * preferred edition, then the four patterns, then the limit.
 */
export function buildSuggest(
  text: string,
  limit = 12,
  preferEdition: '2024' | '2014' = '2024',
  campaignSourceId: string | null = null,
): { sql: string; params: unknown[] } {
  const term = likeEscape(text.trim().toLowerCase());
  const tier = `CASE WHEN lower(r.display_name) = ? THEN 0 WHEN r.display_name LIKE ? ESCAPE '\\' THEN 1 WHEN r.display_name LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END`;
  const base = `SELECT r.id, r.kind, r.key, r.name, r.display_name, r.source_id, s.name AS source_name, s.priority AS source_priority, r.edition, r.cr, r.type, r.size, r.environment, r.is_npc, r.level, r.type_code, r.rarity, CASE WHEN s.kind = 'campaign' THEN r.source_id || char(31) || r.key ELSE r.key END AS group_key, ${tier} AS tier FROM records r JOIN sources s ON s.id = r.source_id WHERE s.enabled = 1 AND r.display_name LIKE ? ESCAPE '\\' AND ${CAMPAIGN_FILTER}`;
  const ranked = `SELECT *, ROW_NUMBER() OVER (PARTITION BY kind, group_key ORDER BY source_priority, (edition = ?) DESC, edition DESC, source_name COLLATE NOCASE, id) AS rn, GROUP_CONCAT(edition) OVER (PARTITION BY kind, group_key) AS editions, GROUP_CONCAT(source_priority || char(31) || source_name || char(31) || edition, char(30)) OVER (PARTITION BY kind, group_key) AS versions FROM (${base})`;
  return {
    sql: `SELECT * FROM (${ranked}) WHERE rn = 1 ORDER BY tier, display_name COLLATE NOCASE, kind LIMIT ?`,
    params: [
      preferEdition,
      text.trim().toLowerCase(),
      `${term}%`,
      `% ${term}%`,
      `%${term}%`,
      campaignSourceId ?? '',
      Math.min(Math.max(limit, 1), SUGGEST_LIMIT),
    ],
  };
}

/** Where `snippet()` marks a hit; control characters never occur in record text. */
export const SNIPPET_OPEN = '\u0001';
export const SNIPPET_CLOSE = '\u0002';
const TEXT_LIMIT = 100;

/** FTS5 MATCH for `text` as one phrase in the text column, the last word as a prefix. */
export function buildPhraseMatch(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return `text : "${words.join(' ').replace(/"/g, '""')}"*`;
}

/**
 * The global search's compendium text half (ADR 0017): records whose text holds `text` as a
 * phrase but whose name does not (names are `buildSuggest`'s job), best bm25 first, editions
 * collapsed like `buildSearch`, each with a `snippet()` of the text column. bm25() and
 * snippet() only work in the plain inner query, never beside the window function, hence the
 * nesting. Placeholders bind in text order: the preferred edition, the MATCH, the name LIKE,
 * the limit.
 */
export function buildTextSearch(
  text: string,
  limit = 12,
  preferEdition: '2024' | '2014' = '2024',
  campaignSourceId: string | null = null,
): { sql: string; params: unknown[] } | null {
  const match = buildPhraseMatch(text);
  if (!match) return null;
  const term = likeEscape(text.trim().toLowerCase());
  const base = `SELECT r.id, r.kind, r.key, r.name, r.display_name, r.source_id, s.name AS source_name, s.priority AS source_priority, r.edition, r.cr, r.type, r.size, r.environment, r.is_npc, r.level, r.type_code, r.rarity, CASE WHEN s.kind = 'campaign' THEN r.source_id || char(31) || r.key ELSE r.key END AS group_key, snippet(records_fts, 2, char(1), char(2), '…', 12) AS snip, bm25(records_fts) AS rank FROM records r JOIN records_fts f ON f.id = r.id JOIN sources s ON s.id = r.source_id WHERE records_fts MATCH ? AND s.enabled = 1 AND r.display_name NOT LIKE ? ESCAPE '\\' AND ${CAMPAIGN_FILTER}`;
  const ranked = `SELECT *, ROW_NUMBER() OVER (PARTITION BY kind, group_key ORDER BY source_priority, (edition = ?) DESC, edition DESC, source_name COLLATE NOCASE, id) AS rn, GROUP_CONCAT(edition) OVER (PARTITION BY kind, group_key) AS editions, GROUP_CONCAT(source_priority || char(31) || source_name || char(31) || edition, char(30)) OVER (PARTITION BY kind, group_key) AS versions FROM (${base})`;
  return {
    sql: `SELECT * FROM (${ranked}) WHERE rn = 1 ORDER BY rank, display_name COLLATE NOCASE LIMIT ?`,
    params: [
      preferEdition,
      match,
      `%${term}%`,
      campaignSourceId ?? '',
      Math.min(Math.max(limit, 1), TEXT_LIMIT),
    ],
  };
}

/**
 * A `snippet()` result as before / match / after. FTS marks each matched word on its own, so a
 * phrase arrives as several marked words with spaces between; they join into one match. Marks
 * after the first run are dropped.
 */
export function splitSnippet(snip: string): { before: string; match: string; after: string } {
  const strip = (t: string) =>
    t.split(SNIPPET_OPEN).join('').split(SNIPPET_CLOSE).join('').replace(/\s+/g, ' ');
  const open = snip.indexOf(SNIPPET_OPEN);
  if (open < 0) return { before: '', match: '', after: strip(snip) };
  let close = snip.indexOf(SNIPPET_CLOSE, open);
  if (close < 0) close = snip.length;
  // Extend over the next marked word while only spaces sit between.
  for (;;) {
    let k = close + 1;
    while (k < snip.length && /\s/.test(snip[k]!)) k += 1;
    if (snip[k] !== SNIPPET_OPEN) break;
    const end = snip.indexOf(SNIPPET_CLOSE, k);
    if (end < 0) break;
    close = end;
  }
  return {
    before: strip(snip.slice(0, open)),
    match: strip(snip.slice(open, close)),
    after: strip(snip.slice(close + 1)),
  };
}
