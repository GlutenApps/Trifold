import { mkdir, readdir, rm } from 'node:fs/promises';
import { ulid } from 'ulid';
import type { TrifoldApi } from '@trifold/api';
import { NOTE_TEMPLATE_SCHEMA_VERSION, NoteTemplate, nowIso } from '@trifold/schema';
import type { LibraryStore } from './library/LibraryStore';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';

/**
 * Note templates (ADR 0010): Library-level starting bodies for new notes, one JSON file each
 * under `templates/notes/` (DATA-FORMATS.md §5.4). This module holds the seeded "Session prep"
 * template, the repository and the `noteTemplates` API namespace.
 */
const DIR = 'templates/notes';

/** The one template every Library starts with: a session outline in our own words. */
export const SESSION_PREP_TEMPLATE = {
  name: 'Session prep',
  body: [
    '## Characters',
    '',
    'Who is at the table tonight, and what each of them wants right now.',
    '',
    '## Strong start',
    '',
    'The first thing that happens. Open in motion.',
    '',
    '## Scenes',
    '',
    'Three or four that might happen, in any order.',
    '',
    '## Secrets and clues',
    '',
    'Ten things the party might learn, one line each. Any scene can reveal any of them.',
    '',
    '## Locations',
    '',
    'Where tonight could go, with one striking detail each.',
    '',
    '## NPCs',
    '',
    'Who they might meet: a name, a want, a tell.',
    '',
    '## Monsters',
    '',
    'What might fight them, and where that would be fair.',
    '',
    '## Treasure',
    '',
    'What they might find, and what it means.',
  ].join('\n'),
};

/**
 * Note templates (ADR 0010): one JSON file each under `Library/templates/notes/`. The folder is
 * seeded with the session-prep outline the first time it is missing; once it exists, deleting
 * every template leaves it empty for good.
 */
export class NoteTemplatesRepository {
  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<NoteTemplate[]> {
    let files = await this.listDir();
    if (files === null) {
      await this.seed();
      files = (await this.listDir()) ?? [];
    }
    const out: NoteTemplate[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        out.push(await this.store.readJson(`${DIR}/${file}`, NoteTemplate, 'noteTemplate'));
      } catch (err) {
        this.logger.warn(
          `${DIR}/${file} skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return out.sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name),
    );
  }

  async save(input: NoteTemplate): Promise<NoteTemplate> {
    const template = NoteTemplate.parse({
      ...input,
      schemaVersion: NOTE_TEMPLATE_SCHEMA_VERSION,
      id: input.id || ulid(),
      name: input.name.trim() || 'Untitled template',
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await mkdir(this.store.resolvePath(DIR), { recursive: true });
    await this.store.writeJson(`${DIR}/${template.id}.json`, template);
    return template;
  }

  async remove(id: string): Promise<void> {
    await rm(this.store.resolvePath(`${DIR}/${id}.json`), { force: true });
  }

  /** The folder's files, or null when there is no folder yet. */
  private async listDir(): Promise<string[] | null> {
    try {
      return await readdir(this.store.resolvePath(DIR));
    } catch {
      return null;
    }
  }

  private async seed(): Promise<void> {
    await this.save({
      schemaVersion: NOTE_TEMPLATE_SCHEMA_VERSION,
      id: '',
      ...SESSION_PREP_TEMPLATE,
      createdAt: '',
      updatedAt: '',
    });
  }
}

export function createNoteTemplatesApi(
  session: LibrarySession,
  logger: Logger,
): Pick<TrifoldApi, 'noteTemplates'> {
  const repo = () => {
    if (!session.store) throw new Error('No Library is open');
    return new NoteTemplatesRepository(session.store, logger);
  };
  return {
    noteTemplates: {
      async list() {
        return repo().list();
      },
      async save(template) {
        return repo().save(template);
      },
      async remove(id) {
        await repo().remove(id);
      },
    },
  };
}
