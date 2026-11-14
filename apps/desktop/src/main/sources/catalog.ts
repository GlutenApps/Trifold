import type { CompendiumRecord, Source } from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';
import type { BundledSources } from './bundled';
import { HOMEBREW_SOURCE_ID, type HomebrewRepository } from './homebrew';
import type { SourceRepository } from './repository';

/** Everything the index can be built from: bundled SRD documents plus the Library's own sources. */
export interface SourceCatalog {
  list(): Promise<Source[]>;
  readAllRecords(sourceId: string): Promise<CompendiumRecord[]>;
}

/**
 * The bundled SRD documents, imported sources, the Library's homebrew and every campaign's own
 * creatures (ADR 0035): a campaign with creatures is one more source, which the index keeps for
 * every campaign and the queries show only while that campaign is open.
 */
export class CombinedCatalog implements SourceCatalog {
  constructor(
    private readonly bundled: BundledSources,
    private readonly repository: SourceRepository,
    private readonly store: LibraryStore,
    private readonly homebrew: HomebrewRepository,
    /** One creature folder per campaign; none before campaigns exist. */
    private readonly campaignCreatures: () => Promise<HomebrewRepository[]> = async () => [],
  ) {}

  async list(): Promise<Source[]> {
    const disabled = this.store.getSettings().disabledSourceIds;
    const creatures: Source[] = [];
    for (const folder of await this.campaignCreatures()) {
      const source = await folder.source();
      // A campaign without creatures adds no source row.
      if (Object.values(source.recordCounts).some((n) => (n ?? 0) > 0)) creatures.push(source);
    }
    return [
      ...this.bundled.sources(disabled),
      ...(await this.repository.list()),
      await this.homebrew.source(),
      ...creatures,
    ];
  }

  async readAllRecords(sourceId: string): Promise<CompendiumRecord[]> {
    if (sourceId === HOMEBREW_SOURCE_ID) return this.homebrew.list();
    if (sourceId.startsWith('campaign:')) {
      const folder = (await this.campaignCreatures()).find((f) => f.sourceId === sourceId);
      return folder ? folder.list() : [];
    }
    return this.bundled.has(sourceId)
      ? this.bundled.readAllRecords(sourceId)
      : this.repository.readAllRecords(sourceId);
  }
}
