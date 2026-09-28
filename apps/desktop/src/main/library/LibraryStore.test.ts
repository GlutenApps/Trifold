import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Source } from '@trifold/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_LAYOUT, LibraryStore } from './LibraryStore';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-library-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LibraryStore.open', () => {
  it('creates the folder layout and a default library.json', async () => {
    const root = join(dir, 'My Library');
    const store = await LibraryStore.open(root);
    expect(store.root).toBe(root);
    const entries = await readdir(root);
    for (const folder of LIBRARY_LAYOUT) {
      expect(entries).toContain(folder.split('/')[0]);
    }
    const settings = JSON.parse(await readFile(join(root, 'library.json'), 'utf8'));
    expect(settings.schemaVersion).toBe(3);
    expect(store.getSettings().theme).toBe('dark');
  });

  it('reads an existing library.json and keeps its values', async () => {
    const root = join(dir, 'lib');
    const first = await LibraryStore.open(root);
    await first.updateSettings({ theme: 'light', playerDisplayId: 7 });

    const second = await LibraryStore.open(root);
    expect(second.getSettings().theme).toBe('light');
    expect(second.getSettings().playerDisplayId).toBe(7);
  });

  it('rejects a library.json from a newer app', async () => {
    const root = join(dir, 'newer');
    await LibraryStore.open(root);
    await writeFile(join(root, 'library.json'), JSON.stringify({ schemaVersion: 99 }));
    await expect(LibraryStore.open(root)).rejects.toThrow(/newer than this app/);
  });
});

describe('LibraryStore paths and json', () => {
  it('writes and reads validated JSON inside the Library', async () => {
    const store = await LibraryStore.open(join(dir, 'lib'));
    const source = {
      schemaVersion: 1,
      id: 'src1',
      name: 'Test',
      kind: 'xml',
      license: { nonSrd: false, attribution: null },
      importedAt: '2026-09-27T00:00:00.000Z',
    };
    await store.writeJson('sources/src1/source.json', source);
    const read = await store.readJson('sources/src1/source.json', Source, 'source');
    expect(read.name).toBe('Test');
    expect(read.enabled).toBe(true);
  });

  it('refuses paths that escape the root', async () => {
    const store = await LibraryStore.open(join(dir, 'lib'));
    expect(() => store.resolvePath('../outside.json')).toThrow(/escapes/);
    expect(() => store.resolvePath('sources/../../x')).toThrow(/escapes/);
    expect(store.resolvePath('.')).toBe(store.root);
  });
});
