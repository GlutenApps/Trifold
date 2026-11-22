import Database from 'better-sqlite3';
import type {
  CompendiumFacets,
  CompendiumQuery,
  CompendiumSearchResult,
  CompendiumSuggestion,
  CompendiumTextHit,
  IndexStats,
} from '@trifold/api';
import { CompendiumRecord, type RecordKind, type Source } from '@trifold/schema';
import {
  bookFilter,
  buildSearch,
  campaignBooksFilter,
  buildSuggest,
  PRIORITY,
  buildTextSearch,
  indexText,
  recordColumns,
  splitSnippet,
  toRow,
  type RawRow,
} from './query';

/** `Source.campaignIds` as the sources table stores it: a JSON array, or NULL for every campaign. */
export function campaignsColumn(campaignIds: readonly string[] | null | undefined): string | null {
  return campaignIds ? JSON.stringify(campaignIds) : null;
}

/** `buildSuggest`'s numeric tier column as the API names it. */
const SUGGEST_TIERS: Record<number, CompendiumSuggestion['tier']> = {
  0: 'exact',
  1: 'prefix',
  2: 'word',
  3: 'substring',
};

/**
 * The SQLite index (DESIGN.md §4.3, DATA-FORMATS.md §5.6): a derived, rebuildable view of the
 * records on disk, never the only copy of anything (CLAUDE.md ground rule 2). This class owns
 * the connection, the table layout and every query; the SQL that needs no database lives in
 * `query.ts` so it can be unit-tested. Rows are replaced one whole source at a time; `sync.ts`
 * decides which sources need it from their file hash and enabled flag.
 */
/** Bump when the derived table layout changes; the tables are dropped and rebuilt from files. */
export const INDEX_VERSION = 6;

/** DATA-FORMATS.md §5.6. Every row is derived from `sources/<id>/records.jsonl`. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  file_hash TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  -- The campaigns this source shows in (ADR 0036): a JSON array of campaign ids, NULL for all.
  campaigns TEXT,
  -- Source priority (ADR 0027), 0 highest; set by applySourceOrder after every sync.
  priority INTEGER NOT NULL DEFAULT 1000000
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  edition TEXT NOT NULL,
  cr TEXT,
  cr_num REAL,
  type TEXT,
  size TEXT,
  environment TEXT,
  is_npc INTEGER NOT NULL DEFAULT 0,
  level INTEGER,
  type_code TEXT,
  rarity TEXT,
  -- The book its Source line names (ADR 0061): bookKey(name), '' when none, and the name.
  book_key TEXT NOT NULL DEFAULT '',
  book TEXT NOT NULL DEFAULT '',
  -- From library.json's books, set by applyBookSettings after every sync.
  starred INTEGER NOT NULL DEFAULT 0,
  book_off INTEGER NOT NULL DEFAULT 0,
  -- The copy the GM chose for its record (ADR 0063), from library.json's duplicateChoices.
  chosen INTEGER NOT NULL DEFAULT 0,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_book ON records(book_key, source_id);
CREATE INDEX IF NOT EXISTS records_kind_key ON records(kind, key);
CREATE INDEX IF NOT EXISTS records_source ON records(source_id);
CREATE INDEX IF NOT EXISTS records_kind_name ON records(kind, display_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS records_kind_cr ON records(kind, cr_num);
CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
  id UNINDEXED, name, text, tokenize = 'unicode61 remove_diacritics 2'
);
`;

export interface SourceRow {
  id: string;
  name: string;
  kind: string;
  enabled: number;
  file_hash: string | null;
  record_count: number;
  campaigns: string | null;
}

/**
 * The derived SQLite index (DESIGN.md §4.3). Safe to delete at any time; never the only copy of
 * anything. Only the main process touches it.
 */
export class IndexDb {
  private constructor(private readonly db: Database.Database) {}

  static open(file: string): IndexDb {
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    const index = new IndexDb(db);
    index.ensureSchema();
    return index;
  }

  /** Drops and recreates the derived tables when the layout version changes. */
  ensureSchema(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    if (this.getMeta('indexVersion') !== String(INDEX_VERSION)) {
      this.db.exec(
        'DROP TABLE IF EXISTS records_fts; DROP TABLE IF EXISTS records; DROP TABLE IF EXISTS sources;',
      );
      this.db.exec(SCHEMA);
      this.setMeta('indexVersion', String(INDEX_VERSION));
    }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  // ---------- sources ----------

  listSourceRows(): SourceRow[] {
    return this.db.prepare('SELECT * FROM sources ORDER BY name').all() as SourceRow[];
  }

  getSourceRow(id: string): SourceRow | null {
    return (
      (this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined) ??
      null
    );
  }

  /** Replaces every row of a source in one transaction. Returns the number of records written. */
  replaceSource(source: Source, records: Iterable<CompendiumRecord>): number {
    const insertRecord = this.db.prepare(
      `INSERT INTO records (id, kind, key, name, display_name, source_id, edition, cr, cr_num, type, size, environment, is_npc, level, type_code, rarity, book_key, book, json)
       VALUES (@id, @kind, @key, @name, @display_name, @source_id, @edition, @cr, @cr_num, @type, @size, @environment, @is_npc, @level, @type_code, @rarity, @book_key, @book, @json)`,
    );
    const insertFts = this.db.prepare('INSERT INTO records_fts (id, name, text) VALUES (?, ?, ?)');
    const upsertSource = this.db.prepare(
      `INSERT INTO sources (id, name, kind, enabled, file_hash, record_count, campaigns) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, enabled = excluded.enabled,
         file_hash = excluded.file_hash, record_count = excluded.record_count, campaigns = excluded.campaigns`,
    );

    const run = this.db.transaction((rows: Iterable<CompendiumRecord>) => {
      this.deleteSourceRows(source.id);
      let count = 0;
      for (const record of rows) {
        insertRecord.run(recordColumns(record));
        insertFts.run(record.id, record.displayName, indexText(record));
        count += 1;
      }
      upsertSource.run(
        source.id,
        source.name,
        source.kind,
        source.enabled ? 1 : 0,
        source.fileHash ?? null,
        count,
        campaignsColumn(source.campaignIds),
      );
      return count;
    });
    return run(records);
  }

  private deleteSourceRows(sourceId: string): void {
    this.db
      .prepare('DELETE FROM records_fts WHERE id IN (SELECT id FROM records WHERE source_id = ?)')
      .run(sourceId);
    this.db.prepare('DELETE FROM records WHERE source_id = ?').run(sourceId);
  }

  removeSource(sourceId: string): void {
    this.db.transaction(() => {
      this.deleteSourceRows(sourceId);
      this.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);
    })();
  }

  setSourceEnabled(sourceId: string, enabled: boolean): void {
    this.db.prepare('UPDATE sources SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, sourceId);
  }

  /** Which campaigns a source shows in (ADR 0036); null for every campaign. */
  setSourceCampaigns(sourceId: string, campaignIds: readonly string[] | null | undefined): void {
    this.db
      .prepare('UPDATE sources SET campaigns = ? WHERE id = ?')
      .run(campaignsColumn(campaignIds), sourceId);
  }

  clearAll(): void {
    this.db.exec('DELETE FROM records_fts; DELETE FROM records; DELETE FROM sources;');
  }

  // ---------- compendium ----------

  search(query: CompendiumQuery): CompendiumSearchResult {
    const started = performance.now();
    const built = buildSearch(query);
    const rows = (this.db.prepare(built.sql).all(...built.params) as RawRow[]).map(toRow);
    const total = (this.db.prepare(built.countSql).get(...built.countParams) as { n: number }).n;
    return { rows, total, tookMs: Math.round((performance.now() - started) * 10) / 10 };
  }

  suggest(
    text: string,
    opts: {
      limit?: number;
      preferEdition?: '2024' | '2014';
      campaignSourceId?: string | null;
      campaignId?: string | null;
      campaignBookKeys?: string[] | null;
    } = {},
  ): CompendiumSuggestion[] {
    if (!text.trim()) return [];
    const built = buildSuggest(
      text,
      opts.limit,
      opts.preferEdition,
      opts.campaignSourceId ?? null,
      opts.campaignId ?? null,
      opts.campaignBookKeys ?? null,
    );
    return (this.db.prepare(built.sql).all(...built.params) as (RawRow & { tier: number })[]).map(
      (raw) => ({ ...toRow(raw), tier: SUGGEST_TIERS[raw.tier] ?? 'substring' }),
    );
  }

  searchText(
    text: string,
    opts: {
      limit?: number;
      preferEdition?: '2024' | '2014';
      campaignSourceId?: string | null;
      campaignId?: string | null;
      campaignBookKeys?: string[] | null;
    } = {},
  ): CompendiumTextHit[] {
    const built = buildTextSearch(
      text,
      opts.limit,
      opts.preferEdition,
      opts.campaignSourceId ?? null,
      opts.campaignId ?? null,
      opts.campaignBookKeys ?? null,
    );
    if (!built) return [];
    return (this.db.prepare(built.sql).all(...built.params) as (RawRow & { snip: string })[]).map(
      (raw) => ({ ...toRow(raw), snippet: splitSnippet(raw.snip ?? '') }),
    );
  }

  get(recordId: string): CompendiumRecord | null {
    const row = this.db.prepare('SELECT json FROM records WHERE id = ?').get(recordId) as
      { json: string } | undefined;
    if (!row) return null;
    const parsed = CompendiumRecord.safeParse(JSON.parse(row.json));
    return parsed.success ? parsed.data : null;
  }

  /** Source priority (ADR 0027): `order[0]` answers first; sources not in it go last. */
  /**
   * Books (ADR 0061): marks each record of a starred book and of a book that is off, from
   * library.json's `books`. Run after every sync, since replaced rows start unmarked.
   */
  applyBookSettings(books: Readonly<Record<string, { starred: boolean; off: boolean }>>): void {
    const entries = Object.entries(books).filter(([, b]) => b.starred || b.off);
    this.db.transaction(() => {
      this.db.exec(
        'UPDATE records SET starred = 0, book_off = 0 WHERE starred = 1 OR book_off = 1',
      );
      for (const [key, b] of entries) {
        const filter = bookFilter([key]);
        if (!filter) continue;
        this.db
          .prepare(`UPDATE records AS r SET starred = ?, book_off = ? WHERE ${filter.sql}`)
          .run(b.starred ? 1 : 0, b.off ? 1 : 0, ...filter.params);
      }
    })();
  }

  /**
   * Duplicates the GM settled (ADR 0063): marks each chosen copy, from library.json's
   * `duplicateChoices`. Run after every sync, since replaced rows start unmarked.
   */
  applyChoices(choices: Readonly<Record<string, string>>): void {
    const mark = this.db.prepare(
      'UPDATE records SET chosen = 1 WHERE kind = ? AND key = ? AND source_id = ? AND book_key = ? AND edition = ?',
    );
    this.db.transaction(() => {
      this.db.exec('UPDATE records SET chosen = 0 WHERE chosen = 1');
      for (const [group, copy] of Object.entries(choices)) {
        const at = group.indexOf('|');
        const parts = copy.split('|');
        if (at < 0 || parts.length !== 3) continue;
        mark.run(group.slice(0, at), group.slice(at + 1), parts[0], parts[1], parts[2]);
      }
    })();
  }

  /**
   * Every copy of each record that is in more than one place (ADR 0063), with the copy that
   * answers now marked by `rn = 1`. A place is a file and a book; copies that are only the
   * bundled SRD's two editions are not a duplicate, since the preferred edition settles them.
   * Campaign creatures belong to their campaign and are left out.
   */
  duplicateRows(preferEdition: '2024' | '2014' = '2024'): Array<{
    id: string;
    kind: string;
    key: string;
    display_name: string;
    source_id: string;
    source_name: string;
    source_kind: string;
    book_key: string;
    book: string;
    edition: string;
    starred: number;
    chosen: number;
    rn: number;
  }> {
    return this.db
      .prepare(
        `WITH copies AS (
           SELECT r.id, r.kind, r.key, r.display_name, r.source_id, s.name AS source_name, s.kind AS source_kind,
                  r.book_key, r.book, r.edition, r.starred, r.chosen, ${PRIORITY} AS pr
           FROM records r JOIN sources s ON s.id = r.source_id
           WHERE s.enabled = 1 AND r.book_off = 0 AND s.kind != 'campaign'
         ), groups AS (
           SELECT kind, key FROM copies GROUP BY kind, key
           HAVING COUNT(DISTINCT source_id || char(31) || book_key) > 1 AND SUM(source_kind != 'srd') > 0
         )
         SELECT c.id, c.kind, c.key, c.display_name, c.source_id, c.source_name, c.source_kind, c.book_key, c.book,
                c.edition, c.starred, c.chosen,
                ROW_NUMBER() OVER (PARTITION BY c.kind, c.key ORDER BY c.pr, (c.edition = ?) DESC, c.edition DESC, c.source_name COLLATE NOCASE, c.id) AS rn
         FROM copies c JOIN groups g ON g.kind = c.kind AND g.key = c.key
         ORDER BY c.display_name COLLATE NOCASE, c.kind, rn`,
      )
      .all(preferEdition) as never;
  }

  /**
   * Every book in the imported files (ADR 0061), counted by file, kind and edition: what the
   * Books view lists. Records that name no book count as their file's unnamed book.
   */
  bookRows(): Array<{
    book_key: string;
    book: string;
    source_id: string;
    source_name: string;
    kind: string;
    edition: string;
    n: number;
  }> {
    return this.db
      .prepare(
        `SELECT r.book_key, MIN(r.book) AS book, r.source_id, s.name AS source_name, r.kind, r.edition, COUNT(*) AS n
         FROM records r JOIN sources s ON s.id = r.source_id
         WHERE s.kind IN ('xml', 'open5e')
         GROUP BY r.book_key, r.source_id, r.kind, r.edition`,
      )
      .all() as never;
  }

  /**
   * The records of some books in the imported files (ADR 0062), for sharing a collection. Books
   * that are off are still shared: off is the GM's own view.
   */
  recordsOfBooks(keys: readonly string[]): CompendiumRecord[] {
    const books = bookFilter(keys);
    if (!books) return [];
    const rows = this.db
      .prepare(
        `SELECT r.json FROM records r JOIN sources s ON s.id = r.source_id WHERE s.kind IN ('xml', 'open5e') AND s.enabled = 1 AND ${books.sql}`,
      )
      .all(...books.params) as Array<{ json: string }>;
    const out: CompendiumRecord[] = [];
    for (const row of rows) {
      const parsed = CompendiumRecord.safeParse(JSON.parse(row.json));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  applySourceOrder(order: readonly string[]): void {
    const reset = this.db.prepare('UPDATE sources SET priority = 1000000');
    const set = this.db.prepare('UPDATE sources SET priority = ? WHERE id = ?');
    this.db.transaction(() => {
      reset.run();
      order.forEach((id, i) => set.run(i, id));
    })();
  }

  /**
   * Every version of a record, highest-priority source first (ADR 0027). Campaign creatures are
   * never versions of a Library record (ADR 0035). With `campaignId`, a source limited to other
   * campaigns is left out (ADR 0036).
   */
  findByKey(
    kind: RecordKind,
    key: string,
    includeDisabled = false,
    campaignId: string | null = null,
    campaignBookKeys: readonly string[] | null = null,
  ): CompendiumRecord[] {
    const used = campaignBooksFilter(campaignBookKeys);
    const limit =
      (campaignId
        ? ' AND (s.campaigns IS NULL OR EXISTS (SELECT 1 FROM json_each(s.campaigns) WHERE value = ?))'
        : '') + (used ? ` AND ${used.sql}` : '');
    const sql = `SELECT r.json FROM records r JOIN sources s ON s.id = r.source_id WHERE r.kind = ? AND r.key = ? AND s.kind != 'campaign'${includeDisabled ? '' : ' AND s.enabled = 1 AND r.book_off = 0'}${limit} ORDER BY ${PRIORITY}, r.edition DESC, r.id`;
    const params = [kind, key, ...(campaignId ? [campaignId] : []), ...(used?.params ?? [])];
    const rows = this.db.prepare(sql).all(...params) as Array<{ json: string }>;
    const out: CompendiumRecord[] = [];
    for (const row of rows) {
      const parsed = CompendiumRecord.safeParse(JSON.parse(row.json));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  facets(kind: RecordKind): CompendiumFacets {
    const distinct = (column: string): string[] =>
      (
        this.db
          .prepare(
            `SELECT DISTINCT r.${column} AS v FROM records r JOIN sources s ON s.id = r.source_id WHERE r.kind = ? AND s.enabled = 1 AND r.${column} IS NOT NULL ORDER BY v`,
          )
          .all(kind) as Array<{ v: string }>
      ).map((r) => r.v);
    const environments = new Set<string>();
    for (const list of distinct('environment')) {
      for (const e of list.split(',')) {
        const v = e.trim();
        if (v) environments.add(v);
      }
    }
    return {
      types: distinct('type'),
      sizes: distinct('size'),
      environments: [...environments].sort(),
    };
  }

  stats(tookMs = 0): IndexStats {
    const records = (this.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n;
    const sources = (this.db.prepare('SELECT COUNT(*) AS n FROM sources').get() as { n: number }).n;
    return { records, sources, version: INDEX_VERSION, tookMs };
  }

  recordCount(): number {
    return this.stats().records;
  }

  close(): void {
    this.db.close();
  }
}
