import { join } from 'node:path';
import type { LibraryInfo } from '@trifold/api';
import { INDEX_VERSION, IndexDb } from '../index/IndexDb';
import { errorMessage, type Logger } from '../log';
import { LibraryStore } from './LibraryStore';

/** The one open Library (DESIGN.md §4.2: several Libraries are supported, one open at a time). */
export class LibrarySession {
  store: LibraryStore | null = null;
  index: IndexDb | null = null;
  private path = '';
  private error: string | null = null;
  private indexError: string | null = null;

  constructor(private readonly logger: Logger) {}

  get logDir(): string | null {
    return this.store?.logDir ?? null;
  }

  /** Never throws: a Library that fails to open is reported through `LibraryInfo`. */
  async open(path: string): Promise<LibraryInfo> {
    this.close();
    this.path = path;
    try {
      this.store = await LibraryStore.open(path);
      this.error = null;
      this.logger.info(`Library opened: ${this.store.root}`);
    } catch (err) {
      this.store = null;
      this.error = errorMessage(err);
      this.logger.error(`Library failed to open at ${path}: ${this.error}`);
    }

    if (this.store) {
      try {
        this.index = IndexDb.open(join(this.store.root, 'index.sqlite'));
        this.indexError = null;
      } catch (err) {
        this.index = null;
        this.indexError = errorMessage(err);
        this.logger.error(`Index failed to open: ${this.indexError}`);
      }
    }
    return this.info();
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
    this.store = null;
  }
}
