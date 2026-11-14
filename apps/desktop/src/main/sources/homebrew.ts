import { createHash } from 'node:crypto';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { featureFromText } from '@trifold/importers';
import { normalizeKey } from '@trifold/rules';
import { CompendiumRecord, type Feature, type Source } from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';

/**
 * The DM's own records (DESIGN.md §6.2, DATA-FORMATS.md §5.3): plain JSON files under
 * `homebrew/`, presented to the index as one virtual source whose hash follows the files.
 * `HomebrewRepository` below.
 */
export const HOMEBREW_SOURCE_ID = 'homebrew';
const ID = /^[A-Za-z0-9:_-]+$/;

/** Where a set of the DM's records lives and what source it is to the index. */
export interface RecordFolder {
  /** Library-relative folder, one `<id>.json` per record. */
  dir: string;
  sourceId: string;
  name: string;
  kind: 'homebrew' | 'campaign';
  /** First part of a new record's id. */
  idPrefix: string;
  /** What `basedOn` copies carry as their source book. */
  sourceBook: string;
}

/** The Library's homebrew: `homebrew/`, the virtual `homebrew` source. */
export const LIBRARY_HOMEBREW: RecordFolder = {
  dir: 'homebrew',
  sourceId: HOMEBREW_SOURCE_ID,
  name: 'Homebrew',
  kind: 'homebrew',
  idPrefix: HOMEBREW_SOURCE_ID,
  sourceBook: 'Trifold Homebrew',
};

/** A campaign's own source id (ADR 0035): one per campaign folder. */
export const campaignSourceId = (slug: string) => `campaign:${slug}`;

/** A campaign's creatures (ADR 0035): `campaigns/<slug>/creatures/`, its own virtual source. */
export function campaignCreatures(slug: string, campaignName: string): RecordFolder {
  return {
    dir: `campaigns/${slug}/creatures`,
    sourceId: campaignSourceId(slug),
    name: campaignName,
    kind: 'campaign',
    idPrefix: 'creature',
    sourceBook: campaignName,
  };
}

/**
 * The DM's own records (DESIGN.md §6.2, DATA-FORMATS.md §5.3): one `<id>.json` per record in a
 * folder that is one virtual source to the index, the Library's `homebrew/` or a campaign's
 * `creatures/` (ADR 0035). The source's hash follows the files so the index resyncs after every
 * save. A record read from a folder always takes that folder's source id, so a campaign imported
 * under another slug owns its creatures.
 */
export class HomebrewRepository {
  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
    readonly folder: RecordFolder = LIBRARY_HOMEBREW,
  ) {}

  get sourceId(): string {
    return this.folder.sourceId;
  }

  private async files(): Promise<Array<{ name: string; mtimeMs: number }>> {
    const dir = this.store.resolvePath(this.folder.dir);
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
      id: this.folder.sourceId,
      name: this.folder.name,
      kind: this.folder.kind,
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
        out.push(
          this.own(
            await this.store.readJson(`${this.folder.dir}/${f.name}`, CompendiumRecord, 'record'),
          ),
        );
      } catch (err) {
        this.logger.warn(`skipping ${this.folder.dir}/${f.name}: ${String(err)}`);
      }
    }
    return out;
  }

  /** A record read from this folder belongs to its source, whatever the file says. */
  private own(record: CompendiumRecord): CompendiumRecord {
    return record.sourceId === this.folder.sourceId
      ? record
      : { ...record, sourceId: this.folder.sourceId };
  }

  async get(recordId: string): Promise<CompendiumRecord | null> {
    if (!ID.test(recordId)) return null;
    try {
      return this.own(
        await this.store.readJson(
          `${this.folder.dir}/${fileName(recordId)}`,
          CompendiumRecord,
          'record',
        ),
      );
    } catch {
      return null;
    }
  }

  /**
   * A copy of any record as a homebrew record with `basedOn` provenance (DESIGN.md §6.2), not yet
   * written: Duplicate saves it at once, Save to compendium opens it in the editor first.
   */
  copyOf(original: CompendiumRecord): CompendiumRecord {
    // A distinct key too: normalizeKey strips parentheses, so no "(copy)" suffix.
    const displayName = `Copy of ${original.displayName}`;
    const copy = CompendiumRecord.parse({
      ...original,
      id: `${this.folder.idPrefix}:${original.kind}:${ulid()}`,
      name: displayName,
      displayName,
      key: normalizeKey(displayName),
      sourceId: this.folder.sourceId,
      sourceBook: this.folder.sourceBook,
      basedOn: { recordId: original.id, sourceId: original.sourceId },
    });
    delete (copy as { sourcePage?: number }).sourcePage;
    return copy;
  }

  /**
   * A record from another folder brought into this one under its own name (ADR 0035, Add to my
   * compendium): a new id, the same stat block, and the same `basedOn`, so it still points at
   * the stock creature it was made from.
   */
  async adopt(record: CompendiumRecord): Promise<CompendiumRecord> {
    const copy = CompendiumRecord.parse({
      ...record,
      id: `${this.folder.idPrefix}:${record.kind}:${ulid()}`,
      sourceId: this.folder.sourceId,
      sourceBook: this.folder.sourceBook,
    });
    return this.save(copy);
  }

  /** A copy of any record placed in homebrew (DESIGN.md §6.2). */
  async duplicate(original: CompendiumRecord): Promise<CompendiumRecord> {
    return this.save(this.copyOf(original));
  }

  /**
   * Validates and writes a record. Monster features are re-derived from their name and text so
   * the tracker's attack, save and recharge buttons follow the DM's edits.
   */
  async save(record: CompendiumRecord): Promise<CompendiumRecord> {
    if (record.sourceId !== this.folder.sourceId)
      throw new Error(`Only ${this.folder.name} records can be saved here`);
    if (!ID.test(record.id)) throw new Error('Bad record id');
    const displayName = record.displayName.trim();
    if (!displayName) throw new Error('A name is required');
    const prepared = withParsedFeatures(record);
    const saved = CompendiumRecord.parse({
      ...prepared,
      name: displayName,
      displayName,
      key: normalizeKey(displayName),
    });
    await this.store.writeJson(`${this.folder.dir}/${fileName(saved.id)}`, saved);
    this.logger.info(`${this.folder.dir} saved: ${saved.kind} ${saved.displayName}`);
    return saved;
  }

  async remove(recordId: string): Promise<void> {
    if (!ID.test(recordId)) return;
    try {
      await unlink(this.store.resolvePath(`${this.folder.dir}/${fileName(recordId)}`));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

/** `homebrew/<this>`: a record's file name (ids hold colons, which Windows refuses). */
export function fileName(recordId: string): string {
  return `${recordId.replace(/:/g, '_')}.json`;
}

/**
 * A monster's features re-derived from their name and text, as `save` writes them, so the
 * tracker's attack, save and recharge buttons follow the DM's edits. Other kinds as they are.
 */
export function withParsedFeatures(record: CompendiumRecord): CompendiumRecord {
  if (record.kind !== 'monster') return record;
  return {
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
  };
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
