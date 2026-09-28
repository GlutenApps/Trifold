import { join } from 'node:path';
import type { LibraryInfo } from '@trifold/api';
import { INDEX_VERSION, IndexDb } from '../index/IndexDb';
import { syncIndex } from '../index/sync';
import { CampaignRepository } from '../campaign/repository';
import { BackupService } from '../backups';
import { MusicRepository } from '../music/repository';
import { errorMessage, type Logger } from '../log';
import { BundledSources } from '../sources/bundled';
import { CombinedCatalog } from '../sources/catalog';
import { SourceRepository } from '../sources/repository';
import { LibraryStore } from './LibraryStore';

export interface OpenSession {
  store: LibraryStore;
  sources: SourceRepository;
  bundled: BundledSources;
  catalog: CombinedCatalog;
  index: IndexDb;
}

/** The one open Library (DESIGN.md §4.2: several Libraries are supported, one open at a time). */
export class LibrarySession {
  store: LibraryStore | null = null;
  sources: SourceRepository | null = null;
  catalog: CombinedCatalog | null = null;
  campaigns: CampaignRepository | null = null;
  music: MusicRepository | null = null;
  backups: BackupService | null = null;
  index: IndexDb | null = null;
  readonly bundled: BundledSources;
  private path = '';
  private error: string | null = null;
  private indexError: string | null = null;

  constructor(
    private readonly logger: Logger,
    bundledResourcesDir: string,
  ) {
    this.bundled = new BundledSources(bundledResourcesDir, logger);
  }

  get logDir(): string | null {
    return this.store?.logDir ?? null;
  }

  /** Never throws: a Library that fails to open is reported through `LibraryInfo`. */
  async open(path: string): Promise<LibraryInfo> {
    this.close();
    this.path = path;
    try {
      this.store = await LibraryStore.open(path);
      this.sources = new SourceRepository(this.store, this.logger);
      await this.bundled.load();
      this.catalog = new CombinedCatalog(this.bundled, this.sources, this.store);
      this.campaigns = new CampaignRepository(this.store, this.logger);
      this.music = new MusicRepository(this.store, this.logger);
      this.backups = new BackupService(this.store, this.logger);
      this.error = null;
      this.logger.info(`Library opened: ${this.store.root}`);
    } catch (err) {
      this.store = null;
      this.sources = null;
      this.catalog = null;
      this.campaigns = null;
      this.music = null;
      this.backups = null;
      this.error = errorMessage(err);
      this.logger.error(`Library failed to open at ${path}: ${this.error}`);
    }

    if (this.store && this.catalog) {
      try {
        this.index = IndexDb.open(join(this.store.root, 'index.sqlite'));
        this.indexError = null;
        const stats = await syncIndex(this.index, this.catalog, this.store, this.logger);
        this.logger.info(
          `index ready: ${stats.records} records from ${stats.sources} sources (${stats.tookMs} ms)`,
        );
      } catch (err) {
        this.index = null;
        this.indexError = errorMessage(err);
        this.logger.error(`Index failed to open: ${this.indexError}`);
      }
    }
    return this.info();
  }

  /** The open store, sources, catalog and index, or a clear error for API callers. */
  require(): OpenSession {
    if (!this.store || !this.sources || !this.catalog) throw new Error('No Library is open');
    if (!this.index) {
      throw new Error(`The search index is unavailable: ${this.indexError ?? 'unknown'}`);
    }
    return {
      store: this.store,
      sources: this.sources,
      bundled: this.bundled,
      catalog: this.catalog,
      index: this.index,
    };
  }

  info(): LibraryInfo {
    return {
      path: this.store?.root ?? this.path,
      ok: this.store !== null,
      error: this.error,
      settings: this.store?.getSettings() ?? null,
      index: { ok: this.index !== null, version: INDEX_VERSION, error: this.indexError },
    };
  }

  close(): void {
    this.index?.close();
    this.index = null;
    this.catalog = null;
    this.campaigns = null;
    this.music = null;
    this.backups = null;
    this.sources = null;
    this.store = null;
  }
}
