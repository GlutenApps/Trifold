import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic, writeJsonAtomic } from './atomicWrite';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-atomic-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('creates the file and any missing parent folders', async () => {
    const file = join(dir, 'nested', 'deeper', 'a.txt');
    await writeFileAtomic(file, 'hello');
    expect(await readFile(file, 'utf8')).toBe('hello');
  });

  it('replaces an existing file in full', async () => {
    const file = join(dir, 'b.txt');
    await writeFileAtomic(file, 'first version, quite long');
    await writeFileAtomic(file, 'second');
    expect(await readFile(file, 'utf8')).toBe('second');
  });

  it('leaves no temp files behind', async () => {
    const file = join(dir, 'c.txt');
    await writeFileAtomic(file, 'x');
    await writeFileAtomic(file, 'y');
    expect(await readdir(dir)).toEqual(['c.txt']);
  });

  it('survives concurrent writers to the same path', async () => {
    const file = join(dir, 'd.txt');
    await Promise.all(Array.from({ length: 10 }, (_, i) => writeFileAtomic(file, `v${i}`)));
    const content = await readFile(file, 'utf8');
    expect(content).toMatch(/^v\d$/);
    expect(await readdir(dir)).toEqual(['d.txt']);
  });
});

describe('writeJsonAtomic', () => {
  it('writes 2-space indented JSON with a trailing newline', async () => {
    const file = join(dir, 'e.json');
    await writeJsonAtomic(file, { schemaVersion: 1, list: [1, 2] });
    expect(await readFile(file, 'utf8')).toBe(
      '{\n  "schemaVersion": 1,\n  "list": [\n    1,\n    2\n  ]\n}\n',
    );
  });
});
