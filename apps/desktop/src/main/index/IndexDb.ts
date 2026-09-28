import Database from 'better-sqlite3';

/** Bump when the derived table layout changes; the tables are dropped and rebuilt from files. */
export const INDEX_VERSION = 1;

/** DATA-FORMATS.md §5.6. Populated by the importers (M1). */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  file_hash TEXT
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
  type TEXT,
  size TEXT,
  environment TEXT,
  is_npc INTEGER NOT NULL DEFAULT 0,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_kind_key ON records(kind, key);
CREATE INDEX IF NOT EXISTS records_source ON records(source_id);
CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(name, text, content='');
`;

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

  recordCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
