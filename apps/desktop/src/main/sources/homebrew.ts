import { createHash } from 'node:crypto';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { featureFromText } from '@trifold/importers';
import { normalizeKey } from '@trifold/rules';
import { CompendiumRecord, type Feature, type Source } from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';

export const HOMEBREW_SOURCE_ID = 'homebrew';
const DIR = 'homebrew';
const ID = /^[A-Za-z0-9:_-]+$/;

/**
 * The DM's own records (DESIGN.md §6.2, DATA-FORMATS.md §5.3): one `homebrew/<id>.json` per
 * record, all under the virtual `homebrew` source. The source's hash follows the files so the
 * index resyncs after every save.
 */
export class HomebrewRepository {
  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
  ) {}

  private async files(): Promise<Array<{ name: string; mtimeMs: number }>> {
    const dir = this.store.resolvePath(DIR);
    let names: string[] = [];
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
    const out = [];
    for (const name of names) {
      const info = await stat(join(dir, name));
      out.push({ name, mtimeMs: info.mtimeMs });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The virtual source row; `fileHash` changes whenever any record file does. */
  async source(): Promise<Source> {
    const files = await this.files();
    const hash = createHash('sha1');
    for (const f of files) hash.update(`${f.name}:${Math.round(f.mtimeMs)}\n`);
    const records = await this.list();
    const counts: Partial<Record<CompendiumRecord['kind'], number>> = {};
    for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    return {
      schemaVersion: 1,
      id: HOMEBREW_SOURCE_ID,
      name: 'Homebrew',
      kind: 'homebrew',
      fileHash: `files:${hash.digest('hex')}`,
      enabled: true,
      defaultEdition: '2024',
      edition2024Books: [],
      license: { attribution: null, nonSrd: false },
      importedAt: new Date(0).toISOString(),
      importerVersion: 0,
      recordCounts: counts,
      warnings: [],
    };
  }

  async list(): Promise<CompendiumRecord[]> {
    const out: CompendiumRecord[] = [];
    for (const f of await this.files()) {
      try {
        out.push(await this.store.readJson(`${DIR}/${f.name}`, CompendiumRecord, 'record'));
      } catch (err) {
        this.logger.warn(`skipping homebrew/${f.name}: ${String(err)}`);
      }
    }
    return out;
  }

  async get(recordId: string): Promise<CompendiumRecord | null> {
    if (!ID.test(recordId)) return null;
    try {
      return await this.store.readJson(`${DIR}/${fileName(recordId)}`, CompendiumRecord, 'record');
    } catch {
      return null;
    }
  }

  /** A copy of any record placed in homebrew with `basedOn` provenance (DESIGN.md §6.2). */
  async duplicate(original: CompendiumRecord): Promise<CompendiumRecord> {
    // A distinct key too: normalizeKey strips parentheses, so no "(copy)" suffix.
    const displayName = `Copy of ${original.displayName}`;
    const copy = CompendiumRecord.parse({
      ...original,
      id: `${HOMEBREW_SOURCE_ID}:${original.kind}:${ulid()}`,
      name: displayName,
      displayName,
      key: normalizeKey(displayName),
      sourceId: HOMEBREW_SOURCE_ID,
      sourceBook: 'Trifold Homebrew',
      basedOn: { recordId: original.id, sourceId: original.sourceId },
    });
    delete (copy as { sourcePage?: number }).sourcePage;
    return this.save(copy);
  }

  /**
   * Validates and writes a record. Monster features are re-derived from their name and text so
   * the tracker's attack, save and recharge buttons follow the DM's edits.
   */
  async save(record: CompendiumRecord): Promise<CompendiumRecord> {
    if (record.sourceId !== HOMEBREW_SOURCE_ID)
      throw new Error('Only homebrew records can be saved');
    if (!ID.test(record.id)) throw new Error('Bad record id');
    const displayName = record.displayName.trim();
    if (!displayName) throw new Error('A name is required');
    const prepared: CompendiumRecord =
      record.kind === 'monster'
        ? {
            ...record,
            data: {
              ...record.data,
              traits: reparse(record.data.traits),
              actions: reparse(record.data.actions),
              bonusActions: reparse(record.data.bonusActions),
              reactions: reparse(record.data.reactions),
              legendary: {
                ...record.data.legendary,
                actions: reparse(record.data.legendary.actions),
              },
              lair: reparse(record.data.lair),
            },
          }
        : record;
    const saved = CompendiumRecord.parse({
      ...prepared,
      name: displayName,
      displayName,
      key: normalizeKey(displayName),
    });
    await this.store.writeJson(`${DIR}/${fileName(saved.id)}`, saved);
    this.logger.info(`homebrew saved: ${saved.kind} ${saved.displayName}`);
    return saved;
  }

  async remove(recordId: string): Promise<void> {
    if (!ID.test(recordId)) return;
    try {
      await unlink(this.store.resolvePath(`${DIR}/${fileName(recordId)}`));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

function fileName(recordId: string): string {
  return `${recordId.replace(/:/g, '_')}.json`;
}

function reparse(features: Feature[]): Feature[] {
  return features
    .filter((f) => f.name.trim())
    .map((f) => {
      const rebuilt = featureFromText(f.name, f.text);
      // Keep what the text cannot express: legendary cost and structured attack triples from the
      // original when the DM has not touched the text.
      return {
        ...rebuilt,
        ...(f.cost !== undefined && rebuilt.cost === undefined ? { cost: f.cost } : {}),
        attacks: rebuilt.attacks.length ? rebuilt.attacks : f.attacks,
        rolls: rebuilt.rolls.length ? rebuilt.rolls : f.rolls,
      };
    });
}
