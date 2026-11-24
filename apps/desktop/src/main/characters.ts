import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { dialog } from 'electron';
import { ulid } from 'ulid';
import type { TrifoldApi } from '@trifold/api';
import { linkSheetRecords, readPdfSheet, type PdfSheetProblem } from '@trifold/importers';
import { CHARACTER_SCHEMA_VERSION, Character, migrate, nowIso } from '@trifold/schema';
import type { LibraryStore } from './library/LibraryStore';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';
import { PdfLockedError, readPdfFields } from './pdfFields';

/**
 * The player's characters (docs/PLAYER-MODE.md, Part 3; ADR 0068): one JSON file each under
 * `Library/characters/`, read and written only through `LibraryStore`. A character can also be
 * exported as a file of its own and imported into another Library.
 */
const DIR = 'characters';

/** Larger than any character sheet; the 25-page extended sheet is a few megabytes. */
const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** What Import from PDF says when a PDF holds no sheet it can read (ADR 0073). */
const PDF_PROBLEM: Record<PdfSheetProblem, string> = {
  noFields:
    'This PDF has no fields to read. It may have been printed to PDF or scanned. Export the sheet from your character app as a PDF, or fill in a blank sheet by hand.',
  unknownLayout:
    'Trifold could not find a character sheet in this PDF. It reads fillable sheets that use the usual field names; fill in a blank sheet by hand instead.',
  empty: 'This sheet’s fields are empty. Fill it in first, or start from a blank sheet.',
};

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
  /** A character was written (ADR 0071): a joined campaign linked to it may offer its numbers. */
  onSaved: (characterId: string) => void = () => undefined,
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
        const saved = await repo().save(character);
        onSaved(saved.id);
        return saved;
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
      async readPdf() {
        const result = await dialog.showOpenDialog({
          title: 'Import a character sheet PDF',
          properties: ['openFile'],
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        const path = result.canceled ? null : (result.filePaths[0] ?? null);
        if (!path) return null;
        if ((await stat(path)).size > MAX_PDF_BYTES) {
          throw new Error('This file is too large to be a character sheet.');
        }
        let fields;
        try {
          fields = await readPdfFields(new Uint8Array(await readFile(path)));
        } catch (err) {
          if (err instanceof PdfLockedError) throw err;
          logger.warn(`PDF sheet ${basename(path)} unreadable: ${String(err)}`);
          throw new Error('Trifold could not read this file as a PDF.');
        }
        const read = readPdfSheet(fields);
        if (!read.ok) {
          logger.info(`PDF sheet ${basename(path)}: ${read.problem} (${fields.length} fields)`);
          throw new Error(PDF_PROBLEM[read.problem]);
        }
        logger.info(
          `PDF sheet ${basename(path)} read: ${read.imported.layout}, ${fields.length} fields, ${read.warnings.length} warnings`,
        );
        const { name, edition, notes } = read.imported;
        // Names the compendium has become links, so the sheet can show their text.
        const index = session.index;
        const { sheet, linked } = index
          ? linkSheetRecords(read.imported.sheet, (kind, key) => {
              const hit = index.findByKey(kind, key)[0];
              return hit ? { key: hit.key, name: hit.displayName } : null;
            })
          : { sheet: read.imported.sheet, linked: 0 };
        logger.info(`PDF sheet ${basename(path)}: ${linked} names linked to the compendium`);
        return { fileName: basename(path), name, edition, sheet, notes, warnings: read.warnings };
      },
    },
  };
}
