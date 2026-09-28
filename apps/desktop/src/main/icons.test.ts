import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IconResources } from './icons';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

describe('IconResources', () => {
  let dir: string;
  let logDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trifold-icons-'));
    logDir = join(dir, 'logs');
    mkdirSync(join(dir, 'svg'));
    writeFileSync(join(dir, 'svg', 'goblin-head.svg'), '<svg/>');
    writeFileSync(
      join(dir, 'mapping.json'),
      JSON.stringify({
        creatureType: { humanoid: 'cowled' },
        nameKeywords: { goblin: 'goblin-head' },
      }),
    );
    writeFileSync(
      join(dir, 'credits.json'),
      JSON.stringify({
        license: { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
        source: 'https://game-icons.net',
        authors: [{ name: 'lorc', icons: 1 }],
      }),
    );
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists glyphs, resolves safe names only, and fills missing tables', () => {
    const icons = new IconResources(dir, logger, () => logDir);
    expect([...icons.available()]).toEqual(['goblin-head']);
    expect(icons.svgPath('goblin-head.svg')).toBe(join(dir, 'svg', 'goblin-head.svg'));
    expect(icons.svgPath('goblin-head')).toBe(join(dir, 'svg', 'goblin-head.svg'));
    expect(icons.svgPath('../mapping.json')).toBeNull();
    expect(icons.svgPath('skull')).toBeNull();
    expect(icons.tables().nameKeywords).toEqual({ goblin: 'goblin-head' });
    expect(icons.tables().synonyms).toEqual({});
    expect(icons.credits()).toMatchObject({ icons: 1, authors: [{ name: 'lorc', icons: 1 }] });
  });

  it('records each miss once in the Library log folder', async () => {
    const icons = new IconResources(dir, logger, () => logDir);
    await icons.reportMiss('creature', 'Tarrasque');
    await icons.reportMiss('creature', 'Tarrasque');
    await icons.reportMiss('creature', 'Otyugh');
    expect(readFileSync(join(logDir, 'icon-misses.txt'), 'utf8')).toBe(
      'creature\tTarrasque\ncreature\tOtyugh\n',
    );
  });

  it('copes with a build that has no icon set', () => {
    const bare = new IconResources(join(dir, 'nowhere'), logger, () => null);
    expect(bare.available().size).toBe(0);
    expect(bare.credits()).toBeNull();
    expect(bare.tables().creatureType).toEqual({});
  });
});
