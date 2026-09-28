import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('warns and falls back to defaults when the file is corrupt', async () => {
    const file = join(dir, 'config.json');
    await writeFile(file, '{ not json');
    const store = await AppConfigStore.load(file, logger);
    expect(store.get()).toMatchObject({ schemaVersion: 1, libraryPath: null });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
