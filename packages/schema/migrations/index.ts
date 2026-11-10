/**
 * Forward-only migrations for every stored file kind (CLAUDE.md ground rule 6).
 * A migration takes a document at `from` and returns it at `to`. `migrate()` applies them in order
 * until the document reaches the app's current version, then stamps `schemaVersion`.
 */
export type FileKind =
  | 'appConfig'
  | 'library'
  | 'source'
  | 'record'
  | 'campaign'
  | 'pc'
  | 'encounter'
  | 'adventure'
  | 'note'
  | 'npc'
  | 'scene'
  | 'musicLibrary'
  | 'playlist'
  | 'noteTemplate'
  | 'counter'
  | 'timer';

export type JsonObject = Record<string, unknown>;

export interface Migration {
  from: number;
  to: number;
  migrate: (doc: JsonObject) => JsonObject;
}

export type MigrationRegistry = Record<FileKind, Migration[]>;
export type VersionTable = Record<FileKind, number>;

/**
 * The version each file kind is written at. Bumping one means a migration from the old version
 * in `MIGRATIONS` and the matching `schemaVersion` literal in the Zod schema; several tests
 * hard-code these numbers, and the migration test's fixture table keeps its own.
 */
export const CURRENT_SCHEMA_VERSION: VersionTable = {
  appConfig: 1,
  library: 5,
  source: 1,
  record: 1,
  campaign: 1,
  pc: 1,
  encounter: 1,
  adventure: 1,
  note: 1,
  npc: 1,
  scene: 1,
  musicLibrary: 1,
  playlist: 1,
  noteTemplate: 1,
  counter: 1,
  timer: 1,
};

/** Registered migrations, oldest first. Add an entry whenever a schema version is bumped. */
export const MIGRATIONS: MigrationRegistry = {
  appConfig: [],
  library: [
    {
      from: 1,
      to: 2,
      // ADR 0004: the panel-column workspace became stage + dock; old layouts cannot be mapped.
      migrate: (doc) => ({ ...doc, workspace: { presets: [], seeded: false, consoles: {} } }),
    },
    {
      from: 3,
      to: 4,
      // ADR 0008: the TV controls tool folded into the TV tab; saved layouts drop its dock section.
      migrate: (doc) => ({ ...doc, workspace: dropDockTool(doc['workspace'], 'tv') }),
    },
    {
      from: 2,
      to: 3,
      // ADR 0005: the Combat tab folded into Encounters; layouts and starters are reset.
      migrate: (doc) => ({ ...doc, workspace: { presets: [], seeded: false, consoles: {} } }),
    },
    {
      from: 4,
      to: 5,
      // ADR 0009: Dice, Hotkeys and Layouts became pop-ups; saved layouts drop their dock sections.
      migrate: (doc) => ({
        ...doc,
        workspace: ['dice', 'hotkeys', 'layouts'].reduce(
          (ws, tool) => dropDockTool(ws, tool),
          doc['workspace'],
        ),
      }),
    },
  ],
  source: [],
  record: [],
  campaign: [],
  pc: [],
  encounter: [],
  adventure: [],
  note: [],
  npc: [],
  scene: [],
  musicLibrary: [],
  playlist: [],
  noteTemplate: [],
  counter: [],
  timer: [],
};

/** Removes one minor tool from every saved layout's dock (presets and per-campaign consoles). */
function dropDockTool(workspace: unknown, tool: string): unknown {
  if (!isJsonObject(workspace)) return workspace;
  const strip = (layout: unknown): unknown => {
    if (!isJsonObject(layout) || !isJsonObject(layout['dock'])) return layout;
    const dock = layout['dock'];
    const sections = Array.isArray(dock['sections'])
      ? dock['sections'].filter((s) => !(isJsonObject(s) && s['tool'] === tool))
      : dock['sections'];
    return { ...layout, dock: { ...dock, sections } };
  };
  const presets = Array.isArray(workspace['presets'])
    ? workspace['presets'].map((p) => (isJsonObject(p) ? { ...p, layout: strip(p['layout']) } : p))
    : workspace['presets'];
  const consoles = isJsonObject(workspace['consoles'])
    ? Object.fromEntries(Object.entries(workspace['consoles']).map(([k, v]) => [k, strip(v)]))
    : workspace['consoles'];
  return { ...workspace, presets, consoles };
}

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
