import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfigStore } from './appConfig';
import type { Logger } from './log';

let dir: string;
const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-config-'));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('AppConfigStore', () => {
  it('starts from defaults when the file is missing, without warning', async () => {
    const store = await AppConfigStore.load(join(dir, 'config.json'), logger);
    expect(store.get().libraryPath).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('persists updates and reloads them', async () => {
    const file = join(dir, 'config.json');
    const store = await AppConfigStore.load(file, logger);
    await store.update({ libraryPath: 'C:\\Libraries\\One' });
    expect(JSON.parse(await readFile(file, 'utf8')).libraryPath).toBe('C:\\Libraries\\One');

    const reloaded = await AppConfigStore.load(file, logger);
    expect(reloaded.get().libraryPath).toBe('C:\\Libraries\\One');
  });

  it('keeps both changes when two updates overlap, and idle waits for them', async () => {
    const file = join(dir, 'config.json');
    const store = await AppConfigStore.load(file, logger);
    const bounds = { x: 1, y: 2, width: 800, height: 600, maximized: false };
    void store.update({ consoleWindow: bounds });
    void store.update({ libraryPath: 'C:\\Libraries\\Two' });
    await store.idle();
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.consoleWindow).toEqual(bounds);
    expect(saved.libraryPath).toBe('C:\\Libraries\\Two');
  });

  it('clears temp files a cut-off write left behind, but not fresh ones', async () => {
    const file = join(dir, 'config.json');
    const stale = join(dir, 'config.json.4242.0a1b2c3d.tmp');
    const fresh = join(dir, 'config.json.4343.deadbeef.tmp');
    const other = join(dir, 'other.json.4242.0a1b2c3d.tmp');
    for (const f of [stale, fresh, other]) await writeFile(f, '{}');
    const old = new Date(Date.now() - 5 * 60_000);
    await utimes(stale, old, old);
    await utimes(other, old, old);
    await AppConfigStore.load(file, logger);
    const left = (await readdir(dir)).sort();
    expect(left).toEqual(['config.json.4343.deadbeef.tmp', 'other.json.4242.0a1b2c3d.tmp']);
    expect(logger.info).toHaveBeenCalledWith('removed 1 leftover config.json temp file(s)');
  });

  it('warns and falls back to defaults when the file is corrupt', async () => {
    const file = join(dir, 'config.json');
    await writeFile(file, '{ not json');
    const store = await AppConfigStore.load(file, logger);
    expect(store.get()).toMatchObject({ schemaVersion: 1, libraryPath: null });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
