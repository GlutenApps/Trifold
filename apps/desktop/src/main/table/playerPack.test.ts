import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumRecord } from '@trifold/schema';
import { LibraryStore } from '../library/LibraryStore';
import type { LibrarySession } from '../library/session';
import { packIsOlder, JoinedService } from '../joined/service';
import { JoinedStore } from '../joined/store';
import { writeZipTo } from '../zipWrite';
import { readPlayerPack, writePlayerPack } from './playerPack';

const feat = (id: string, name: string) =>
  ({
    schemaVersion: 1,
    id: `shared:C1:${id}`,
    kind: 'feat',
    key: id,
    name,
    displayName: name,
    sourceId: 'shared:C1',
    edition: '2024',
    tags: [],
    data: { text: 'Text.' },
    sharedFrom: { sourceName: 'Homebrew', nonSrd: false },
  }) as unknown as CompendiumRecord;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-pack-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
});

const manifest = (createdAt = '2026-11-20T12:00:00.000Z') => ({
  campaignId: 'C1',
  campaignName: 'Greyford',
  preferredEdition: '2024' as const,
  allowLegacy: true,
  createdAt,
  sourcesNotIncluded: ['A big compendium'],
  appVersion: '0.5.0',
});

describe('player packs (ADR 0064)', () => {
  it('writes a pack and reads it back', async () => {
    const path = join(dir, 'greyford.trifold-players');
    const written = await writePlayerPack(path, manifest(), {
      hash: 'h1',
      records: [feat('bold', 'Bold'), feat('sly', 'Sly')],
    });
    expect(written).toMatchObject({ kind: 'trifold-players', version: 1, hash: 'h1', records: 2 });
    const read = await readPlayerPack(path);
    expect(read.manifest).toEqual(written);
    expect(read.records.map((r) => (r as { name: string }).name)).toEqual(['Bold', 'Sly']);
  });

  it('refuses a file that is not a pack, and says when a newer Trifold made one', async () => {
    const notZip = join(dir, 'plain.trifold-players');
    await writeFile(notZip, 'hello');
    await expect(readPlayerPack(notZip)).rejects.toThrow('not a player pack');

    const zip = new yazl.ZipFile();
    zip.addBuffer(
      Buffer.from(JSON.stringify({ kind: 'trifold-players', version: 9, campaignId: 'C1' })),
      'manifest.json',
    );
    zip.end();
    const future = join(dir, 'future.trifold-players');
    await writeZipTo(zip, future);
    await expect(readPlayerPack(future)).rejects.toThrow('made by a newer Trifold');
  });

  it('counts a pack as older only when what a Library holds differs and was made later', () => {
    const pack = { hash: 'p', createdAt: '2026-11-20T12:00:00.000Z' };
    expect(packIsOlder(null, pack)).toBe(false);
    expect(packIsOlder({ hash: 'p', at: '2026-11-25T00:00:00.000Z' }, pack)).toBe(false);
    expect(packIsOlder({ hash: 't', at: '2026-11-25T00:00:00.000Z' }, pack)).toBe(true);
    expect(packIsOlder({ hash: 't', at: '2026-11-01T00:00:00.000Z' }, pack)).toBe(false);
  });
});

describe('opening a player pack', () => {
  async function setup() {
    const library = join(dir, 'library');
    const store = await LibraryStore.open(library);
    const shared: Array<[string, number]> = [];
    const service = new JoinedService({
      session: { store } as unknown as LibrarySession,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      enabled: true,
      onTables: () => undefined,
      onShared: (id, n) => void shared.push([id, n]),
    });
    return { service, joined: new JoinedStore(store), shared };
  }

  it('joins the campaign and keeps its content, then takes a newer pack and refuses an older one', async () => {
    const { service, joined, shared } = await setup();
    const first = join(dir, 'first.trifold-players');
    await writePlayerPack(first, manifest('2026-11-20T12:00:00.000Z'), {
      hash: 'h1',
      // A record aimed at another source is dropped before anything is kept.
      records: [feat('bold', 'Bold'), { ...feat('x', 'X'), sourceId: 'homebrew', id: 'hb-x' }],
    });
    const info = await service.inspectPack(first);
    expect(info).toMatchObject({
      campaignId: 'C1',
      campaignName: 'Greyford',
      joined: false,
      older: false,
    });

    const opened = await service.openPack(first, 'Sam');
    expect(opened).toMatchObject({
      ok: true,
      records: 1,
      campaign: { campaignId: 'C1', displayName: 'Sam' },
    });
    expect((await joined.get('C1'))?.addresses).toEqual([]);
    expect((await joined.sharedRecords('shared:C1')).map((r) => r.key)).toEqual(['bold']);
    expect(await joined.sharedInfo('C1')).toEqual({ hash: 'h1', at: '2026-11-20T12:00:00.000Z' });
    expect(shared).toEqual([['C1', 1]]);

    const newer = join(dir, 'newer.trifold-players');
    await writePlayerPack(newer, manifest('2026-11-22T12:00:00.000Z'), {
      hash: 'h2',
      records: [feat('bold', 'Bold'), feat('sly', 'Sly')],
    });
    expect(await service.openPack(newer, 'Someone else')).toMatchObject({ ok: true, records: 2 });
    // Joined already: the name stays the player's.
    expect((await joined.get('C1'))?.displayName).toBe('Sam');

    expect(await service.inspectPack(first)).toMatchObject({ joined: true, older: true });
    expect(await service.openPack(first, 'Sam')).toMatchObject({ ok: false, reason: 'older' });
    expect((await joined.sharedRecords('shared:C1')).map((r) => r.key)).toEqual(['bold', 'sly']);
    await service.settled();
  });

  it('says so when the file is not a pack', async () => {
    const { service } = await setup();
    const bad = join(dir, 'bad.trifold-players');
    await writeFile(bad, 'nope');
    expect(await service.openPack(bad, 'Sam')).toMatchObject({ ok: false, reason: 'unreadable' });
  });
});
