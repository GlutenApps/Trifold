/**
 * Forward-only migrations for every stored file kind (CLAUDE.md ground rule 6).
 * A migration takes a document at `from` and returns it at `to`. `migrate()` applies them in order
 * until the document reaches the app's current version, then stamps `schemaVersion`.
 */
export type FileKind =
  'appConfig' | 'library' | 'source' | 'record' | 'campaign' | 'pc' | 'encounter';

export type JsonObject = Record<string, unknown>;

export interface Migration {
  from: number;
  to: number;
  migrate: (doc: JsonObject) => JsonObject;
}

export type MigrationRegistry = Record<FileKind, Migration[]>;
export type VersionTable = Record<FileKind, number>;

export const CURRENT_SCHEMA_VERSION: VersionTable = {
  appConfig: 1,
  library: 1,
  source: 1,
  record: 1,
  campaign: 1,
  pc: 1,
  encounter: 1,
};

/** Registered migrations, oldest first. Add an entry whenever a schema version is bumped. */
export const MIGRATIONS: MigrationRegistry = {
  appConfig: [],
  library: [],
  source: [],
  record: [],
  campaign: [],
  pc: [],
  encounter: [],
};

export class MigrationError extends Error {
  override name = 'MigrationError';
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createMigrator(registry: MigrationRegistry, versions: VersionTable) {
  return function migrate(kind: FileKind, doc: unknown): JsonObject {
    if (!isJsonObject(doc)) {
      throw new MigrationError(`${kind}: expected a JSON object`);
    }
    const target = versions[kind];
    const raw = doc['schemaVersion'];
    // Files written before versioning existed are treated as version 1.
    let version = typeof raw === 'number' && Number.isInteger(raw) ? raw : 1;
    if (version > target) {
      throw new MigrationError(
        `${kind}: schemaVersion ${version} is newer than this app supports (${target}). Update the app.`,
      );
    }
    let current: JsonObject = { ...doc, schemaVersion: version };
    while (version < target) {
      const step = registry[kind].find((m) => m.from === version);
      if (!step) {
        throw new MigrationError(`${kind}: no migration from schemaVersion ${version}`);
      }
      current = { ...step.migrate(current), schemaVersion: step.to };
      version = step.to;
    }
    return current;
  };
}

export const migrate = createMigrator(MIGRATIONS, CURRENT_SCHEMA_VERSION);
