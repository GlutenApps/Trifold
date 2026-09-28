import type { CompendiumRecord, Source } from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';
import type { BundledSources } from './bundled';
import type { SourceRepository } from './repository';

/** Everything the index can be built from: bundled SRD documents plus the Library's own sources. */
export interface SourceCatalog {
  list(): Promise<Source[]>;
  readAllRecords(sourceId: string): Promise<CompendiumRecord[]>;
}

export class CombinedCatalog implements SourceCatalog {
  constructor(
    private readonly bundled: BundledSources,
    private readonly repository: SourceRepository,
    private readonly store: LibraryStore,
  ) {}

  async list(): Promise<Source[]> {
    const disabled = this.store.getSettings().disabledSourceIds;
    return [...this.bundled.sources(disabled), ...(await this.repository.list())];
  }

  readAllRecords(sourceId: string): Promise<CompendiumRecord[]> {
    return this.bundled.has(sourceId)
      ? this.bundled.readAllRecords(sourceId)
      : this.repository.readAllRecords(sourceId);
  }
}
