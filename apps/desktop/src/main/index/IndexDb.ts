import Database from 'better-sqlite3';
import type {
  CompendiumFacets,
  CompendiumQuery,
  CompendiumSearchResult,
  IndexStats,
} from '@trifold/api';
import { CompendiumRecord, type RecordKind, type Source } from '@trifold/schema';
import { buildSearch, indexText, recordColumns, toRow, type RawRow } from './query';

/** Bump when the derived table layout changes; the tables are dropped and rebuilt from files. */
export const INDEX_VERSION = 2;

/** DATA-FORMATS.md §5.6. Every row is derived from `sources/<id>/records.jsonl`. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  file_hash TEXT,
  record_count INTEGER NOT NULL DEFAULT 0
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
  json TEXT NOT NULL
);
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
      `INSERT INTO records (id, kind, key, name, display_name, source_id, edition, cr, cr_num, type, size, environment, is_npc, level, type_code, rarity, json)
       VALUES (@id, @kind, @key, @name, @display_name, @source_id, @edition, @cr, @cr_num, @type, @size, @environment, @is_npc, @level, @type_code, @rarity, @json)`,
    );
    const insertFts = this.db.prepare('INSERT INTO records_fts (id, name, text) VALUES (?, ?, ?)');
    const upsertSource = this.db.prepare(
      `INSERT INTO sources (id, name, kind, enabled, file_hash, record_count) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, enabled = excluded.enabled,
         file_hash = excluded.file_hash, record_count = excluded.record_count`,
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

  get(recordId: string): CompendiumRecord | null {
    const row = this.db.prepare('SELECT json FROM records WHERE id = ?').get(recordId) as
      { json: string } | undefined;
    if (!row) return null;
    const parsed = CompendiumRecord.safeParse(JSON.parse(row.json));
    return parsed.success ? parsed.data : null;
  }

  findByKey(kind: RecordKind, key: string, includeDisabled = false): CompendiumRecord[] {
    const sql = includeDisabled
      ? 'SELECT r.json FROM records r WHERE r.kind = ? AND r.key = ? ORDER BY r.edition DESC'
      : 'SELECT r.json FROM records r JOIN sources s ON s.id = r.source_id WHERE r.kind = ? AND r.key = ? AND s.enabled = 1 ORDER BY r.edition DESC';
    const rows = this.db.prepare(sql).all(kind, key) as Array<{ json: string }>;
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
