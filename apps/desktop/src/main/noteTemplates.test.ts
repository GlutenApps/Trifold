import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from './library/LibraryStore';
import type { Logger } from './log';
import { NoteTemplatesRepository, SESSION_PREP_TEMPLATE } from './noteTemplates';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let dir: string;
let repo: NoteTemplatesRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-templates-'));
  repo = new NoteTemplatesRepository(await LibraryStore.open(join(dir, 'Library')), logger);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('NoteTemplatesRepository', () => {
  it('seeds the session-prep template once, as a file the DM can delete for good', async () => {
    const first = await repo.list();
    expect(first.map((t) => t.name)).toEqual([SESSION_PREP_TEMPLATE.name]);
    expect(first[0]?.body).toContain('## Secrets and clues');
    expect(await readdir(join(dir, 'Library', 'templates', 'notes'))).toHaveLength(1);

    await repo.remove(first[0]!.id);
    expect(await repo.list()).toEqual([]);
    // Asking again does not bring it back.
    expect(await repo.list()).toEqual([]);
  });

  it('saves new and edited templates and lists them oldest first', async () => {
    await repo.list();
    const mine = await repo.save({
      schemaVersion: 1,
      id: '',
      name: '  Dungeon room  ',
      body: '## Entrances\n\n## What is here',
      createdAt: '',
      updatedAt: '',
    });
    expect(mine.name).toBe('Dungeon room');
    expect(mine.id).not.toBe('');

    await repo.save({ ...mine, body: '## Entrances\n\n## What is here\n\n## Treasure' });
    const listed = await repo.list();
    expect(listed.map((t) => t.name)).toEqual(['Session prep', 'Dungeon room']);
    expect(listed[1]?.body).toContain('## Treasure');
    expect(listed[1]?.createdAt).toBe(mine.createdAt);
  });
});
