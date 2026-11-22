import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoundTableSummary } from '@trifold/api';
import { LibraryStore } from '../library/LibraryStore';
import type { LibrarySession } from '../library/session';
import type { FoundTable } from '../table/mdns';
import { peekTable, type LanSocket } from './lanClient';
import { JoinedService } from './service';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

/** A socket that opens and, when told to, says what a table says first. */
function fakeOpen(reply: object | string | null, remote = '192.168.1.23') {
  const opened: Array<{ url: string; origin: string; sent: string[]; closed: boolean }> = [];
  const open = (url: string, origin: string): LanSocket => {
    const record = { url, origin, sent: [] as string[], closed: false };
    opened.push(record);
    let onClose = () => undefined as void;
    return {
      onOpen: (l) => void queueMicrotask(l),
      onMessage: (l) => {
        if (reply !== null) {
          queueMicrotask(() => l(typeof reply === 'string' ? reply : JSON.stringify(reply)));
        }
      },
      onClose: (l) => void (onClose = l),
      send: (text) => void record.sent.push(text),
      close: () => {
        record.closed = true;
        onClose();
      },
      remoteAddress: () => remote,
    };
  };
  return { open, opened };
}

describe('peekTable', () => {
  const endpoint = { host: '192.168.1.23', port: 8130 };

  it('learns the campaign from the table’s first message, sends nothing and hangs up', async () => {
    const { open, opened } = fakeOpen({
      type: 'campaign',
      campaignId: 'c1',
      campaignName: 'Greyford',
      now: 1,
    });
    expect(await peekTable(endpoint, open)).toEqual({ campaignId: 'c1', campaignName: 'Greyford' });
    expect(opened[0]).toMatchObject({
      url: 'ws://192.168.1.23:8130/ws',
      origin: 'http://192.168.1.23:8130',
      sent: [],
      closed: true,
    });
  });

  it('is nothing when the answer is not a table’s, or nothing answers', async () => {
    expect(await peekTable(endpoint, fakeOpen('<html>').open)).toBeNull();
    expect(await peekTable(endpoint, fakeOpen({ type: 'campaign' }).open)).toBeNull();
    expect(await peekTable(endpoint, fakeOpen(null).open, 20)).toBeNull();
  });

  it('is nothing when a name resolved to an address outside the local network', async () => {
    const { open } = fakeOpen(
      { type: 'campaign', campaignId: 'c1', campaignName: 'x', now: 1 },
      '203.0.113.5',
    );
    expect(await peekTable({ host: 'trifold.local', port: 80 }, open)).toBeNull();
  });
});

describe('JoinedService', () => {
  let root: string;
  let found: FoundTable[];
  let notify: () => void;
  const discovery = { start: vi.fn(), stop: vi.fn(), list: () => found };
  const seen: FoundTableSummary[][] = [];

  const table = (campaignId: string, campaignName: string, host = '192.168.1.23'): FoundTable => ({
    instance: `${campaignId}._trifold._tcp.local`,
    host: 'trifold.local',
    port: 8130,
    addresses: [host, 'fd00::23'],
    campaignId,
    campaignName,
  });

  async function service(enabled = true, reply: object | null = null) {
    const session = { store: await LibraryStore.open(root) } as unknown as LibrarySession;
    return new JoinedService({
      session,
      logger,
      enabled,
      onTables: (tables) => seen.push(tables),
      discovery: (onChange) => {
        notify = () => onChange(found);
        return discovery;
      },
      open: fakeOpen(reply).open,
    });
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-joined-service-'));
    found = [];
    seen.length = 0;
    discovery.start.mockClear();
    discovery.stop.mockClear();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('searches only between start and stop, and lists one row per campaign', async () => {
    const joined = await service();
    expect(discovery.start).not.toHaveBeenCalled();
    found = [table('c1', 'Greyford'), table('c1', 'Greyford', '10.0.0.9'), table('c2', 'Ash')];
    expect(await joined.startSearch()).toEqual([
      { campaignId: 'c1', campaignName: 'Greyford', address: '192.168.1.23:8130', joined: false },
      { campaignId: 'c2', campaignName: 'Ash', address: '192.168.1.23:8130', joined: false },
    ]);
    await joined.startSearch();
    expect(discovery.start).toHaveBeenCalledOnce();

    found = [table('c2', 'Ash')];
    notify();
    expect(seen.at(-1)?.map((t) => t.campaignId)).toEqual(['c2']);

    joined.stopSearch();
    joined.stopSearch();
    expect(discovery.stop).toHaveBeenCalledOnce();
  });

  it('joins a found table, keeps the token out of what the renderer sees, and marks it joined', async () => {
    const joined = await service();
    found = [table('c1', 'Greyford')];
    await joined.startSearch();
    const summary = await joined.join({
      campaignId: 'c1',
      campaignName: 'Greyford',
      displayName: 'Sam',
      address: '192.168.1.23:8130',
    });
    expect(summary).toEqual({
      campaignId: 'c1',
      campaignName: 'Greyford',
      displayName: 'Sam',
      characterId: null,
      joinedAt: expect.any(String),
      lastLiveAt: null,
      claimed: false,
    });
    expect(seen.at(-1)).toEqual([expect.objectContaining({ campaignId: 'c1', joined: true })]);
    expect(await joined.list()).toEqual([summary]);
    const file = JSON.parse(await readFile(join(root, 'joined', 'c1', 'joined.json'), 'utf8'));
    expect(file.addresses).toEqual(['192.168.1.23:8130']);

    await joined.leave('c1');
    expect(await joined.list()).toEqual([]);
    expect(seen.at(-1)).toEqual([expect.objectContaining({ campaignId: 'c1', joined: false })]);
  });

  it('refuses to join at an address that is not on the local network', async () => {
    const joined = await service();
    await expect(
      joined.join({ campaignId: 'c1', campaignName: 'x', displayName: '', address: '8.8.8.8:80' }),
    ).rejects.toThrow(/local network/);
    expect(await joined.list()).toEqual([]);
  });

  it('asks a typed address which campaign it is', async () => {
    const joined = await service(true, {
      type: 'campaign',
      campaignId: 'c9',
      campaignName: 'Typed',
      now: 1,
    });
    expect(await joined.peek('http://192.168.1.23:8130/')).toEqual({
      ok: true,
      table: {
        campaignId: 'c9',
        campaignName: 'Typed',
        address: '192.168.1.23:8130',
        joined: false,
      },
    });
    expect(await joined.peek('example.com')).toEqual({ ok: false, reason: 'address' });
    expect(await (await service(true, null)).peek('10.0.0.1:1')).toEqual({
      ok: false,
      reason: 'noAnswer',
    });
  }, 15_000);

  it('uses the network for nothing while player mode is off', async () => {
    const reply = { type: 'campaign', campaignId: 'c1', campaignName: 'x', now: 1 };
    const sockets = fakeOpen(reply);
    const session = { store: await LibraryStore.open(root) } as unknown as LibrarySession;
    const joined = new JoinedService({
      session,
      logger,
      enabled: false,
      onTables: () => undefined,
      discovery: () => discovery,
      open: sockets.open,
    });
    found = [table('c1', 'Greyford')];
    expect(await joined.startSearch()).toEqual([]);
    expect(await joined.peek('192.168.1.23:8130')).toEqual({ ok: false, reason: 'noAnswer' });
    expect(discovery.start).not.toHaveBeenCalled();
    expect(sockets.opened).toEqual([]);
  });
});
