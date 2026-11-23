import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '@trifold/schema';

vi.mock('electron', () => ({ dialog: {} }));

import { CharactersRepository } from './characters';
import { LibraryStore } from './library/LibraryStore';
import type { Logger } from './log';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const now = '2026-11-23T00:00:00.000Z';
const aria = (extra: Partial<Character> = {}) =>
  ({
    schemaVersion: 1,
    id: 'C1',
    name: 'Aria',
    kind: 'external',
    createdAt: now,
    updatedAt: now,
    ...extra,
  }) as Character;

let dir: string;
let repo: CharactersRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-characters-'));
  const store = await LibraryStore.open(join(dir, 'Library'));
  repo = new CharactersRepository(store, logger);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('CharactersRepository (ADR 0068)', () => {
  it('starts empty, saves to characters/<id>.json, lists by name and removes', async () => {
    expect(await repo.list()).toEqual([]);
    const saved = await repo.save(aria({ numbers: { classText: 'Bard 4', level: 4 } as never }));
    expect(saved.numbers).toMatchObject({ classText: 'Bard 4', level: 4, maxHp: 10 });
    expect(saved.updatedAt).not.toBe(now);
    const file = JSON.parse(await readFile(join(dir, 'Library', 'characters', 'C1.json'), 'utf8'));
    expect(file).toMatchObject({ schemaVersion: 1, name: 'Aria', kind: 'external' });
    await repo.save(aria({ id: 'C2', name: 'Bren' }));
    await repo.save(aria({ id: 'C3', name: 'Aaron' }));
    expect((await repo.list()).map((c) => c.name)).toEqual(['Aaron', 'Aria', 'Bren']);
    await repo.remove('C1');
    expect((await repo.list()).map((c) => c.id)).toEqual(['C3', 'C2']);
  });

  it('names an unnamed character, and refuses a bad id or sheet link', async () => {
    expect((await repo.save(aria({ name: '   ' }))).name).toBe('Unnamed character');
    await expect(repo.save(aria({ id: '../x' }))).rejects.toThrow();
    await expect(repo.save(aria({ sheetUrl: 'file:///C:/x' }))).rejects.toThrow();
    await expect(repo.remove('../library')).rejects.toThrow();
  });

  it('skips a file it cannot read', async () => {
    await repo.save(aria());
    await writeFile(join(dir, 'Library', 'characters', 'bad.json'), '{"nope":1}');
    expect((await repo.list()).map((c) => c.id)).toEqual(['C1']);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('imports a character file, as a new character when its id is taken', async () => {
    const first = await repo.adopt(JSON.stringify(aria()));
    expect(first.id).toBe('C1');
    const second = await repo.adopt(JSON.stringify(aria({ name: 'Aria again' })));
    expect(second.id).not.toBe('C1');
    expect((await repo.list()).map((c) => c.name)).toEqual(['Aria', 'Aria again']);
    await expect(repo.adopt('not json')).rejects.toThrow('not a Trifold character');
    await expect(repo.adopt('{"schemaVersion":1}')).rejects.toThrow('not a Trifold character');
  });
});
