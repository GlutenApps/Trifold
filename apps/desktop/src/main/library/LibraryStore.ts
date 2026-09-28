import { mkdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { ZodType } from 'zod';
import {
  defaultLibrarySettings,
  LIBRARY_SCHEMA_VERSION,
  LibrarySettings,
  migrate,
  type FileKind,
} from '@trifold/schema';
import { writeFileAtomic, writeJsonAtomic } from './atomicWrite';

/** Folders created inside every Library (DESIGN.md §4.2). */
export const LIBRARY_LAYOUT = [
  'sources',
  'homebrew',
  'art',
  'campaigns',
  'music',
  'music/playlists',
  'backups',
  'logs',
] as const;

export const LIBRARY_FILE = 'library.json';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The only writer to a Library folder (CLAUDE.md ground rule 2). Lives in the main process.
 * Every write goes through the atomic writer; every read goes through the schema and migrations.
 */
export class LibraryStore {
  private constructor(
    readonly root: string,
    private settings: LibrarySettings,
  ) {}

  /** Opens a Library, creating the folder layout and a default `library.json` when missing. */
  static async open(root: string): Promise<LibraryStore> {
    const abs = resolve(root);
    await mkdir(abs, { recursive: true });
    await Promise.all(LIBRARY_LAYOUT.map((dir) => mkdir(join(abs, dir), { recursive: true })));

    const file = join(abs, LIBRARY_FILE);
    let settings: LibrarySettings;
    if (await exists(file)) {
      const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
      settings = LibrarySettings.parse(migrate('library', raw));
    } else {
      settings = defaultLibrarySettings();
      await writeJsonAtomic(file, settings);
    }
    return new LibraryStore(abs, settings);
  }

  get logDir(): string {
    return join(this.root, 'logs');
  }

  getSettings(): LibrarySettings {
    return this.settings;
  }

  async updateSettings(patch: Partial<LibrarySettings>): Promise<LibrarySettings> {
    const next = LibrarySettings.parse({
      ...this.settings,
      ...patch,
      schemaVersion: LIBRARY_SCHEMA_VERSION,
    });
    await this.writeJson(LIBRARY_FILE, next);
    this.settings = next;
    return next;
  }

  /** Resolves a Library-relative path and refuses anything that escapes the root. */
  resolvePath(relative: string): string {
    const abs = resolve(this.root, relative);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new Error(`path escapes the Library: ${relative}`);
    }
    return abs;
  }

  async readJson<T>(relative: string, schema: ZodType<T>, kind: FileKind): Promise<T> {
    const raw: unknown = JSON.parse(await readFile(this.resolvePath(relative), 'utf8'));
    return schema.parse(migrate(kind, raw));
  }

  async writeJson(relative: string, value: unknown): Promise<void> {
    await writeJsonAtomic(this.resolvePath(relative), value);
  }

  async writeText(relative: string, text: string): Promise<void> {
    await writeFileAtomic(this.resolvePath(relative), text);
  }
}
