import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dialog } from 'electron';
import { ulid } from 'ulid';
import type { TrifoldApi } from '@trifold/api';
import { CHARACTER_SCHEMA_VERSION, Character, migrate, nowIso } from '@trifold/schema';
import type { LibraryStore } from './library/LibraryStore';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';

/**
 * The player's characters (docs/PLAYER-MODE.md, Part 3; ADR 0068): one JSON file each under
 * `Library/characters/`, read and written only through `LibraryStore`. A character can also be
 * exported as a file of its own and imported into another Library.
 */
const DIR = 'characters';

export class CharactersRepository {
  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<Character[]> {
    let files: string[];
    try {
      files = await readdir(this.store.resolvePath(DIR));
    } catch {
      return [];
    }
    const out: Character[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        out.push(await this.store.readJson(`${DIR}/${file}`, Character, 'character'));
      } catch (err) {
        this.logger.warn(
          `${DIR}/${file} skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<Character | null> {
    return (await this.list()).find((c) => c.id === id) ?? null;
  }

  async save(input: Character): Promise<Character> {
    const character = Character.parse({
      ...input,
      schemaVersion: CHARACTER_SCHEMA_VERSION,
      name: input.name.trim() || 'Unnamed character',
      updatedAt: nowIso(),
    });
    await mkdir(this.store.resolvePath(DIR), { recursive: true });
    await this.store.writeJson(`${DIR}/${character.id}.json`, character);
    return character;
  }

  async remove(id: string): Promise<void> {
    Character.shape.id.parse(id);
    await rm(this.store.resolvePath(`${DIR}/${id}.json`), { force: true });
  }

  /**
   * A character from a file outside the Library, migrated and checked; a new id when this
   * Library already has one with its id, so an import never overwrites a character.
   */
  async adopt(text: string): Promise<Character> {
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      throw new Error('This file is not a Trifold character.');
    }
    const parsed = Character.safeParse(migrate('character', doc));
    if (!parsed.success) throw new Error('This file is not a Trifold character.');
    const taken = (await this.list()).some((c) => c.id === parsed.data.id);
    return this.save(taken ? { ...parsed.data, id: ulid(), createdAt: nowIso() } : parsed.data);
  }
}

export function createCharactersApi(
  session: LibrarySession,
  logger: Logger,
): Pick<TrifoldApi, 'characters'> {
  const repo = () => {
    if (!session.store) throw new Error('No Library is open');
    return new CharactersRepository(session.store, logger);
  };
  return {
    characters: {
      async list() {
        return repo().list();
      },
      async save(character) {
        return repo().save(character);
      },
      async remove(id) {
        await repo().remove(id);
      },
      async exportFile(id) {
        const character = await repo().get(id);
        if (!character) throw new Error('That character is no longer in the Library.');
        const result = await dialog.showSaveDialog({
          title: 'Export character',
          defaultPath: `${character.name.replace(/[\\/:*?"<>|]/g, '')}.trifold-character.json`,
          filters: [{ name: 'Trifold character', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) return null;
        // A copy outside the Library, which is the player's to keep: not a Library write.
        await writeFile(result.filePath, `${JSON.stringify(character, null, 2)}\n`, 'utf8');
        logger.info(`character ${id} exported`);
        return result.filePath;
      },
      async importFile() {
        const result = await dialog.showOpenDialog({
          title: 'Import a character',
          properties: ['openFile'],
          filters: [{ name: 'Trifold character', extensions: ['json'] }],
        });
        const path = result.canceled ? null : (result.filePaths[0] ?? null);
        if (!path) return null;
        const character = await repo().adopt(await readFile(path, 'utf8'));
        logger.info(`character ${character.id} imported`);
        return character;
      },
    },
  };
}
