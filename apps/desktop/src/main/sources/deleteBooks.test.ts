import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bookKey, unnamedBookKey } from '@trifold/rules';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { bookOfRecord, deleteBooks, withoutDeletedChoices } from './deleteBooks';
import { importXmlSource, reimportSource, type ImportContext } from './importXml';
import { SourceRepository } from './repository';

const FIXTURE = join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'compendium-sample.xml');
const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const SRD51 = bookKey('System Reference Document 5.1');

let dir: string;
let ctx: ImportContext;
const index = { replaceSource: vi.fn(), removeSource: vi.fn() };
const file = () => join(dir, 'Sample Compendium.xml');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-delete-books-'));
  const store = await LibraryStore.open(join(dir, 'Library'));
  ctx = { store, sources: new SourceRepository(store, logger), index: null, logger };
  await writeFile(file(), await readFile(FIXTURE));
  index.replaceSource.mockClear();
  index.removeSource.mockClear();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const books = async (id: string) =>
  new Set((await ctx.sources.readAllRecords(id)).map((r) => bookOfRecord(r, id)));

describe('deleteBooks (ADR 0065)', () => {
  it('takes a book out of its file and keeps it out on Re-parse', async () => {
    const { sourceId } = await importXmlSource(ctx, file());
    expect(await books(sourceId)).toContain(SRD51);

    const result = await deleteBooks({ sources: ctx.sources, index }, [SRD51], [sourceId]);
    expect(result).toEqual({ records: 6, files: [sourceId], removedFiles: [] });
    expect(await books(sourceId)).not.toContain(SRD51);
    const source = (await ctx.sources.get(sourceId))!;
    expect(source.deletedBooks).toEqual([SRD51]);
    expect(Object.values(source.recordCounts).reduce((a, b) => a + (b ?? 0), 0)).toBe(11);
    expect(index.replaceSource).toHaveBeenCalledTimes(1);

    // Re-parse, as after a parser update: the book stays deleted, the rest keep their ids.
    const before = (await ctx.sources.readAllRecords(sourceId)).map((r) => r.id).sort();
    await ctx.sources.write({ ...(await ctx.sources.get(sourceId))!, importerVersion: 0 });
    expect((await reimportSource(ctx, sourceId)).status).toBe('updated');
    expect(await books(sourceId)).not.toContain(SRD51);
    expect((await ctx.sources.readAllRecords(sourceId)).map((r) => r.id).sort()).toEqual(before);
    expect((await ctx.sources.get(sourceId))!.deletedBooks).toEqual([SRD51]);
    // Marking books as 2024 rules re-reads the file too.
    await reimportSource(ctx, sourceId, ['System Reference Document 5.2.1']);
    expect(await books(sourceId)).not.toContain(SRD51);
  });

  it('brings a deleted book back when the file is imported again', async () => {
    const { sourceId } = await importXmlSource(ctx, file());
    await deleteBooks({ sources: ctx.sources, index }, [SRD51], [sourceId]);
    const again = await importXmlSource(ctx, file());
    expect(again.status).toBe('updated');
    expect(await books(sourceId)).toContain(SRD51);
    expect((await ctx.sources.get(sourceId))!.deletedBooks).toBeUndefined();
  });

  it('removes a file left with no records', async () => {
    const { sourceId } = await importXmlSource(ctx, file());
    const every = [...(await books(sourceId))];
    expect(every).toContain(unnamedBookKey(sourceId));
    const result = await deleteBooks({ sources: ctx.sources, index }, every, [sourceId]);
    expect(result).toEqual({ records: 17, files: [sourceId], removedFiles: [sourceId] });
    expect(await ctx.sources.get(sourceId)).toBeNull();
    expect(index.removeSource).toHaveBeenCalledWith(sourceId);
  });

  it('leaves alone a file that does not hold the book', async () => {
    const { sourceId } = await importXmlSource(ctx, file());
    const result = await deleteBooks({ sources: ctx.sources, index }, ['another book'], [sourceId]);
    expect(result.records).toBe(0);
    expect((await ctx.sources.get(sourceId))!.deletedBooks).toBeUndefined();
    expect(index.replaceSource).not.toHaveBeenCalled();
  });
});

describe('withoutDeletedChoices', () => {
  it('drops choices of a deleted book or a removed file, and keeps the rest', () => {
    const choices = {
      'spell|a': 'F1|tome|2014',
      'spell|b': 'F1|other|2014',
      'spell|c': 'F1||2024',
      'spell|d': 'F2|tome|2014',
      'spell|e': 'F3|x|2014',
    };
    expect(withoutDeletedChoices(choices, ['tome', 'file:F1'], ['F1'], ['F3'])).toEqual({
      'spell|b': 'F1|other|2014',
      'spell|d': 'F2|tome|2014',
    });
  });
});
