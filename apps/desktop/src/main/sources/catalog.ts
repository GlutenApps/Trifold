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

export class CombinedCatalog implements SourceCatalog {
  constructor(
    private readonly bundled: BundledSources,
    private readonly repository: SourceRepository,
    private readonly store: LibraryStore,
    private readonly homebrew: HomebrewRepository,
  ) {}

  async list(): Promise<Source[]> {
    const disabled = this.store.getSettings().disabledSourceIds;
    return [
      ...this.bundled.sources(disabled),
      ...(await this.repository.list()),
      await this.homebrew.source(),
    ];
  }

  readAllRecords(sourceId: string): Promise<CompendiumRecord[]> {
    if (sourceId === HOMEBREW_SOURCE_ID) return this.homebrew.list();
    return this.bundled.has(sourceId)
      ? this.bundled.readAllRecords(sourceId)
      : this.repository.readAllRecords(sourceId);
  }
}
