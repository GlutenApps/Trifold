import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IMPORTER_VERSION } from '@trifold/importers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { importXmlSource, isStale, reimportSource, type ImportContext } from './importXml';
import { SourceRepository } from './repository';

const FIXTURE = join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'compendium-sample.xml');
const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let dir: string;
let ctx: ImportContext;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-import-'));
  const store = await LibraryStore.open(join(dir, 'Library'));
  ctx = { store, sources: new SourceRepository(store, logger), index: null, logger };
  await writeFile(join(dir, 'Sample Compendium.xml'), await readFile(FIXTURE));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('importXmlSource (files only, no index)', () => {
  it('imports a file into sources/<id>/ with records.jsonl and source.json', async () => {
    const report = await importXmlSource(ctx, join(dir, 'Sample Compendium.xml'));
    expect(report.status).toBe('imported');
    expect(report.name).toBe('Sample Compendium');
    expect(report.counts.monster).toBe(6);
    expect(report.warnings).toEqual([]);

    const sources = await ctx.sources.list();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      name: 'Sample Compendium',
      kind: 'xml',
      filePath: 'original.xml',
      importerVersion: IMPORTER_VERSION,
      license: { nonSrd: true },
    });
    const records = await ctx.sources.readAllRecords(report.sourceId);
    expect(records).toHaveLength(17);
    const original = await readFile(
      join(ctx.sources.dirFor(report.sourceId), 'original.xml'),
      'utf8',
    );
    expect(original).toContain('<compendium');
  });

  it('is a no-op for an unchanged file and re-parses when the importer is newer', async () => {
    const first = await importXmlSource(ctx, join(dir, 'Sample Compendium.xml'));
    const again = await importXmlSource(ctx, join(dir, 'Sample Compendium.xml'));
    expect(again.status).toBe('unchanged');
    expect(again.sourceId).toBe(first.sourceId);

    const source = (await ctx.sources.get(first.sourceId))!;
    await ctx.sources.write({ ...source, importerVersion: 0 });
    expect(isStale((await ctx.sources.get(first.sourceId))!)).toBe(true);

    const reparsed = await reimportSource(ctx, first.sourceId);
    expect(reparsed.status).toBe('updated');
    expect(reparsed.name).toBe('Sample Compendium');
    expect(reparsed.diff).toEqual({ added: 0, changed: 0, removed: 0 });
    expect((await ctx.sources.get(first.sourceId))?.importerVersion).toBe(IMPORTER_VERSION);
  });

  it('keeps record ids stable by key and reports a diff when the file changes', async () => {
    const first = await importXmlSource(ctx, join(dir, 'Sample Compendium.xml'));
    const before = await ctx.sources.readAllRecords(first.sourceId);
    const abolethId = before.find((r) => r.name === 'Aboleth')?.id;

    const xml = await readFile(join(dir, 'Sample Compendium.xml'), 'utf8');
    const changed = xml
      .replace('<name>Awakened Shrub</name>', '<name>Awakened Bush</name>')
      .replace('<hp>135 (18d10+36)</hp>', '<hp>140 (18d10+36)</hp>');
    await writeFile(join(dir, 'Sample Compendium.xml'), changed);

    const second = await importXmlSource(ctx, join(dir, 'Sample Compendium.xml'));
    expect(second.status).toBe('updated');
    expect(second.sourceId).toBe(first.sourceId);
    expect(second.diff).toEqual({ added: 1, changed: 1, removed: 1 });
    const after = await ctx.sources.readAllRecords(first.sourceId);
    expect(after.find((r) => r.name === 'Aboleth')?.id).toBe(abolethId);
    expect(after.some((r) => r.name === 'Awakened Bush')).toBe(true);
  });

  it('rejects campaign files and non-compendium XML with a clear message', async () => {
    await writeFile(join(dir, 'party.xml'), '<campaign version="5"><name>x</name></campaign>');
    await expect(importXmlSource(ctx, join(dir, 'party.xml'))).rejects.toThrow(/campaign file/);
    await writeFile(join(dir, 'other.xml'), '<html></html>');
    await expect(importXmlSource(ctx, join(dir, 'other.xml'))).rejects.toThrow(/not a Lion/);
  });

  it('re-tags an unchanged file when its 2024 books change, keeping record ids (ADR 0028)', async () => {
    // The same SRD item from both SRDs, the newer one not tagged [5.5e].
    const item = (book: string) =>
      `<item><name>Longsword</name><type>M</type><text>A martial melee weapon.</text><text>Source: ${book} p. 1</text></item>`;
    const path = join(dir, 'Mixed.xml');
    await writeFile(
      path,
      `<compendium version="5">${item('System Reference Document 5.1')}${item('System Reference Document 5.2.1')}</compendium>`,
    );
    const first = await importXmlSource(ctx, path);
    const before = await ctx.sources.readAllRecords(first.sourceId);
    expect(before.map((r) => r.edition)).toEqual(['2014', '2014']);

    const report = await reimportSource(ctx, first.sourceId, ['System Reference Document 5.2.1']);
    expect(report.status).toBe('updated');
    const after = await ctx.sources.readAllRecords(first.sourceId);
    expect(after.map((r) => r.edition)).toEqual(['2014', '2024']);
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect((await ctx.sources.get(first.sourceId))!.edition2024Books).toEqual([
      'System Reference Document 5.2.1',
    ]);
  });
});
