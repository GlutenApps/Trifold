import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerLink, ServerMessage, SheetOffer } from '@trifold/api';
import { TableNumbers, type PlayerSheet } from '@trifold/schema';
import { LibraryStore } from '../library/LibraryStore';
import type { LibrarySession } from '../library/session';
import type { FoundTable } from '../table/mdns';
import type { LanSocket } from './lanClient';
import { JoinedService } from './service';
import { JoinedStore } from './store';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

/** Sockets the test drives: each one opened is kept, with what was sent on it. */
function sockets() {
  const all: Array<{
    url: string;
    sent: Array<Record<string, unknown>>;
    closed: boolean;
    receive(msg: ServerMessage): void;
    drop(): void;
  }> = [];
  const open = (url: string): LanSocket => {
    let onMessage = (_text: string) => undefined as void;
    let onClose = () => undefined as void;
    const record = {
      url,
      sent: [] as Array<Record<string, unknown>>,
      closed: false,
      receive: (msg: ServerMessage) => onMessage(JSON.stringify(msg)),
      drop: () => onClose(),
    };
    all.push(record);
    return {
      onOpen: () => undefined,
      onMessage: (l) => void (onMessage = l),
      onClose: (l) => void (onClose = l),
      send: (text) => void record.sent.push(JSON.parse(text) as Record<string, unknown>),
      close: () => {
        record.closed = true;
      },
      remoteAddress: () => '192.168.1.23',
    };
  };
  return { all, open };
}

describe('JoinedService: an open campaign', () => {
  let root: string;
  let cache: string;
  let found: FoundTable[];
  let heard: () => void;
  const links: PlayerLink[] = [];
  const messages: ServerMessage[] = [];
  const discovery = { start: vi.fn(), stop: vi.fn(), list: () => found };
  /** Every service a test made, so its saves are finished before its folders are removed. */
  const made: JoinedService[] = [];
  const campaign: ServerMessage = {
    type: 'campaign',
    campaignId: 'c1',
    campaignName: 'Greyford, renamed',
    now: 1,
    protocol: 1,
  };

  const shared: string[] = [];
  let sharedAnswer: { hash: string; records: unknown[] } | null = null;
  const fetchShared = vi.fn(async (_url: string, _token: string) => sharedAnswer);

  async function setup(
    options: {
      enabled?: boolean;
      fetched?: Uint8Array | null;
      characterOffer?: (id: string) => Promise<SheetOffer | null>;
      characterSheet?: (id: string) => Promise<PlayerSheet | null>;
    } = {},
  ) {
    const store = await LibraryStore.open(root);
    await new JoinedStore(store).join({
      campaignId: 'c1',
      campaignName: 'Greyford',
      displayName: 'Sam',
      address: '192.168.1.23:8130',
    });
    const net = sockets();
    const fetchPicture = vi.fn(async () =>
      options.fetched === null
        ? null
        : { body: options.fetched ?? new Uint8Array([1, 2, 3]), type: 'image/jpeg' },
    );
    const service = new JoinedService({
      session: { store } as unknown as LibrarySession,
      logger,
      enabled: options.enabled ?? true,
      onTables: () => undefined,
      onLink: (e) => links.push(e.link),
      onMessage: (e) => messages.push(e.message),
      cacheDir: cache,
      discovery: (onChange) => {
        heard = () => onChange(found);
        return discovery;
      },
      open: net.open,
      fetchPicture,
      fetchShared,
      onShared: (campaignId, records) => void shared.push(`${campaignId}:${records}`),
      ...(options.characterOffer ? { characterOffer: options.characterOffer } : {}),
      ...(options.characterSheet
        ? { characterSheet: options.characterSheet, shareDelayMs: 5 }
        : {}),
    });
    made.push(service);
    const file = async () =>
      JSON.parse(await readFile(join(root, 'joined', 'c1', 'joined.json'), 'utf8')) as {
        deviceToken?: string;
        lastLiveAt: string | null;
        openedAt: string | null;
        campaignName: string;
        addresses: string[];
      };
    return { service, net, fetchPicture, file };
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-joined-open-'));
    cache = await mkdtemp(join(tmpdir(), 'trifold-joined-cache-'));
    found = [];
    links.length = 0;
    messages.length = 0;
    shared.length = 0;
    sharedAnswer = null;
    fetchShared.mockClear();
    discovery.start.mockClear();
    discovery.stop.mockClear();
  });
  afterEach(async () => {
    // A connection saves in the background: a save still landing would leave the folder
    // half-written as it is removed.
    for (const service of made.splice(0)) {
      service.stop();
      await service.settled();
    }
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
    await rm(cache, { recursive: true, force: true, maxRetries: 3 });
  });

  it('connects to the address that worked, and keeps every save of the connection', async () => {
    const { service, net, file } = await setup();
    expect(await service.open('c1')).toMatchObject({ campaignId: 'c1', claimed: false });
    expect(discovery.start).toHaveBeenCalledOnce();
    expect(net.all[0]?.url).toBe('ws://192.168.1.23:8130/ws');

    // The table names the campaign, the player claims, the table hands over the token: three
    // saves to one file within moments, and none of them may undo another. With opening's own
    // save that is four atomic writes in a row, each synced to disk; CI's Windows runners take
    // longer than the default second for them, so the wait is longer.
    net.all[0]!.receive(campaign);
    net.all[0]!.receive({ type: 'token', token: 'secret', campaignId: 'c1' });
    await vi.waitFor(
      async () => {
        expect(await file()).toMatchObject({
          deviceToken: 'secret',
          campaignName: 'Greyford, renamed',
          addresses: ['192.168.1.23:8130'],
        });
        expect((await file()).lastLiveAt).not.toBeNull();
        // Opening was recorded too, and no later save dropped it.
        expect((await file()).openedAt).not.toBeNull();
      },
      { timeout: 10_000 },
    );
    expect(links).toEqual(['connecting', 'open']);

    // The token is the claim and stays in main: the console never receives it.
    expect(messages.map((m) => m.type)).toEqual(['campaign']);
    service.send('c1', { type: 'switch' });
    service.send('other', { type: 'undo' });
    expect(net.all[0]!.sent).toEqual([{ type: 'hello' }, { type: 'switch' }]);

    service.close('c1');
    expect(net.all[0]!.closed).toBe(true);
    expect(discovery.stop).toHaveBeenCalledOnce();
  });

  it('offers the linked sheet’s numbers for the PC held, once, and not again once answered (ADR 0071)', async () => {
    let offer: SheetOffer = {
      name: 'Bren',
      numbers: TableNumbers.parse({ classText: 'Rogue 3', level: 3 }),
    };
    const { service, net, file } = await setup({ characterOffer: async () => offer });
    await service.open('c1');
    await service.linkCharacter('c1', 'K1');
    const ws = net.all[0]!;
    const offers = () => ws.sent.filter((m) => m.type === 'sheetOffer');
    const state = (mine: string[]): ServerMessage => ({
      type: 'state',
      campaignName: 'Greyford',
      live: true,
      mine: mine.map((id) => ({
        kind: 'pc' as const,
        id,
        name: 'Brannoc',
        hp: { current: 20, max: 24, temp: 0 },
        ac: 16,
        conditions: [],
        inFight: false,
        needsInitiative: false,
        editable: { hp: true, maxHp: true, ac: true, conditions: true },
        movementLocked: false,
      })),
      picker: [],
      map: null,
      reclaimMode: 'open',
    });
    ws.receive(campaign);
    // Holding nothing, nothing is offered.
    ws.receive(state([]));
    await new Promise((r) => setTimeout(r, 20));
    expect(offers()).toEqual([]);
    ws.receive(state(['p1']));
    await vi.waitFor(() => expect(offers()).toHaveLength(1));
    expect(offers()[0]).toEqual({ type: 'sheetOffer', creatureId: 'p1', offer });
    // Waiting for the GM: the same view, or the same numbers saved again, sends nothing more.
    ws.receive(state(['p1']));
    service.characterChanged('K1');
    await new Promise((r) => setTimeout(r, 20));
    expect(offers()).toHaveLength(1);
    // Answered: kept in joined.json, so not offered again even after a restart.
    ws.receive({ type: 'sheetAnswer', accepted: false });
    await vi.waitFor(async () =>
      expect((await file()) as { sheetAnswered?: string }).toMatchObject({
        sheetAnswered: expect.stringContaining('Rogue 3'),
      }),
    );
    service.characterChanged('K1');
    await new Promise((r) => setTimeout(r, 20));
    expect(offers()).toHaveLength(1);
    // A level-up is new numbers: offered at once.
    offer = { ...offer, numbers: { ...offer.numbers, classText: 'Rogue 4', level: 4 } };
    service.characterChanged('K1');
    await vi.waitFor(() => expect(offers()).toHaveLength(2));
    // Another character changing is not this campaign's business.
    service.characterChanged('K2');
    await new Promise((r) => setTimeout(r, 20));
    expect(offers()).toHaveLength(2);
  });

  it('shares the linked sheet for the PC held, again only when it changes, and takes it back on Unlink (ADR 0078)', async () => {
    let sheet: PlayerSheet = {
      schemaVersion: 1,
      id: 'K1',
      name: 'Bren',
      kind: 'external',
      edition: '2024',
      numbers: TableNumbers.parse({ classText: 'Rogue 3', level: 3 }),
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    };
    const { service, net } = await setup({ characterSheet: async () => sheet });
    await service.open('c1');
    const ws = net.all[0]!;
    const shares = () => ws.sent.filter((m) => m.type === 'sheetShare');
    const state = (mine: string[]): ServerMessage => ({
      type: 'state',
      campaignName: 'Greyford',
      live: true,
      mine: mine.map((id) => ({
        kind: 'pc' as const,
        id,
        name: 'Brannoc',
        hp: { current: 20, max: 24, temp: 0 },
        ac: 16,
        conditions: [],
        inFight: false,
        needsInitiative: false,
        editable: { hp: true, maxHp: true, ac: true, conditions: true },
        movementLocked: false,
      })),
      picker: [],
      map: null,
      reclaimMode: 'open',
    });
    ws.receive(campaign);
    // Holding a PC with nothing linked: nothing to share, and nothing to take back.
    ws.receive(state(['p1']));
    await new Promise((r) => setTimeout(r, 30));
    expect(shares()).toEqual([]);
    await service.linkCharacter('c1', 'K1');
    await vi.waitFor(() => expect(shares()).toHaveLength(1));
    expect(shares()[0]).toEqual({ type: 'sheetShare', creatureId: 'p1', character: sheet });
    // Saved again unchanged: nothing more. Changed: shared again.
    service.characterChanged('K1');
    await new Promise((r) => setTimeout(r, 30));
    expect(shares()).toHaveLength(1);
    sheet = { ...sheet, name: 'Bren the Bold' };
    service.characterChanged('K1');
    await vi.waitFor(() => expect(shares()).toHaveLength(2));
    // Unlinked: the GM's copy is taken back.
    await service.linkCharacter('c1', null);
    await vi.waitFor(() => expect(shares()).toHaveLength(3));
    expect(shares()[2]).toEqual({ type: 'sheetShare', creatureId: 'p1', character: null });
  });

  it('goes where the search finds the table when the old address stops answering', async () => {
    const { service, net } = await setup();
    await service.open('c1');
    net.all[0]!.drop();
    // The table is up at a new address and port: found by its campaign id, not its address.
    found = [
      {
        instance: 'trifold._trifold._tcp.local',
        host: 'trifold.local',
        port: 8131,
        addresses: ['192.168.1.77'],
        campaignId: 'c1',
        campaignName: 'Greyford',
      },
    ];
    heard();
    expect(net.all.at(-1)?.url).toBe('ws://192.168.1.77:8131/ws');
    // A table for some other campaign is no reason to move.
    const count = net.all.length;
    found = [{ ...found[0]!, campaignId: 'c2', addresses: ['192.168.1.99'] }];
    heard();
    expect(net.all).toHaveLength(count);
  });

  it('opens nothing on the network while player mode is off, or for a campaign not joined', async () => {
    const { service, net } = await setup({ enabled: false });
    expect(await service.open('c1')).toMatchObject({ campaignId: 'c1' });
    expect(await service.open('nope')).toBeNull();
    expect(net.all).toEqual([]);
    expect(discovery.start).not.toHaveBeenCalled();
  });

  it('serves a table’s pictures from the table once, then from its cache', async () => {
    const { service, net, fetchPicture } = await setup();
    const path = '/map/s1/abc-123.jpg';
    // Not connected, nothing cached: there is no picture, and nothing is fetched.
    await service.open('c1');
    expect(await service.picture('c1', path)).toBeNull();
    expect(fetchPicture).not.toHaveBeenCalled();

    net.all[0]!.receive(campaign);
    expect(await service.picture('c1', path)).toEqual({
      body: new Uint8Array([1, 2, 3]),
      type: 'image/jpeg',
    });
    expect(fetchPicture).toHaveBeenCalledWith('http://192.168.1.23:8130/map/s1/abc-123.jpg');
    await service.picture('c1', path);
    expect(fetchPicture).toHaveBeenCalledOnce();

    // Offline, the last map is still there.
    service.close('c1');
    expect((await service.picture('c1', path))?.type).toBe('image/jpeg');
  });

  it('asks a table only for the paths a table serves pictures under', async () => {
    const { service, net, fetchPicture } = await setup();
    await service.open('c1');
    net.all[0]!.receive(campaign);
    for (const bad of [
      '/',
      '/ws',
      '/index.html',
      '/map/../../secret.jpg',
      '/map/s1/k.jpg/extra',
      '/t/tok/art?v=x&u=http://example.com',
      '//example.com/map/s/k.jpg',
      '/c/dm/1/portrait',
    ]) {
      expect(await service.picture('c1', bad), bad).toBeNull();
    }
    expect(fetchPicture).not.toHaveBeenCalled();
    for (const good of [
      '/t/tok/art?v=1a2b',
      '/t/tok/glyph',
      '/c/pc/p1/portrait?v=z',
      '/screen/s/image',
    ]) {
      expect(await service.picture('c1', good), good).not.toBeNull();
    }
    // Another campaign's pictures are not this connection's to fetch.
    expect(await service.picture('c2', '/t/tok/art')).toBeNull();
  });

  const state = (name: string): ServerMessage => ({
    type: 'state',
    campaignName: 'Greyford',
    live: true,
    mine: [{ kind: 'pc', id: 'p1', name }] as never,
    picker: [],
    map: null,
    reclaimMode: 'open',
  });

  it('changes address only to a table running this campaign, then connects there', async () => {
    const { service, net, file } = await setup();
    await service.open('c1');
    // The saved address is tried first and does not answer.
    expect(net.all[0]?.url).toBe('ws://192.168.1.23:8130/ws');
    expect(await service.changeAddress('c1', 'example.com')).toEqual({
      ok: false,
      reason: 'address',
    });
    expect(net.all).toHaveLength(1);

    // The typed address is asked which campaign it is: a second socket, which says another.
    const other = service.changeAddress('c1', '192.168.1.40:8130');
    await vi.waitFor(() => expect(net.all).toHaveLength(2));
    net.all[1]!.receive({ ...campaign, campaignId: 'c2' } as ServerMessage);
    expect(await other).toEqual({ ok: false, reason: 'otherCampaign' });
    expect((await file()).addresses).toEqual(['192.168.1.23:8130']);

    // This campaign's table: the address is kept, first, and the campaign connects there.
    const mine = service.changeAddress('c1', 'http://192.168.1.50:8130/');
    await vi.waitFor(() => expect(net.all).toHaveLength(3));
    net.all[2]!.receive(campaign);
    expect(await mine).toEqual({ ok: true });
    await vi.waitFor(() => expect(net.all.at(-1)?.url).toBe('ws://192.168.1.50:8130/ws'));
    expect(net.all.length).toBeGreaterThan(3);
    await service.settled();
    expect((await file()).addresses.slice(0, 2)).toEqual([
      '192.168.1.50:8130',
      '192.168.1.23:8130',
    ]);
    expect(await service.changeAddress('nope', '192.168.1.50:8130')).toEqual({
      ok: false,
      reason: 'noAnswer',
    });
  });

  it('fetches what the campaign shares when the table names a hash it does not hold', async () => {
    const { service, net } = await setup();
    const store = new JoinedStore(await LibraryStore.open(root));
    await service.open('c1');
    net.all[0]!.receive(campaign);
    net.all[0]!.receive({ type: 'token', token: 'secret', campaignId: 'c1' });
    sharedAnswer = {
      hash: 'h1',
      records: [
        {
          schemaVersion: 1,
          id: 'shared:c1:ward',
          kind: 'feat',
          key: 'ward',
          name: 'Ward',
          displayName: 'Ward',
          sourceId: 'shared:c1',
          edition: '2024',
          data: { text: 'Text.' },
        },
        // Not this campaign's to send: dropped before anything is kept.
        { id: 'hb-mine', sourceId: 'homebrew', kind: 'spell' },
      ],
    };
    net.all[0]!.receive({ type: 'shared', hash: 'h1' });
    await service.settled();
    // The token proves the device; the content comes from the table's own address.
    expect(fetchShared).toHaveBeenCalledWith('http://192.168.1.23:8130/shared', 'secret');
    expect(await store.sharedHash('c1')).toBe('h1');
    expect((await store.sharedRecords('shared:c1')).map((r) => r.id)).toEqual(['shared:c1:ward']);
    // Told once on opening, with nothing held yet, and again with what arrived.
    expect(shared).toEqual(['c1:0', 'c1:1']);
    expect(service.openSharedSourceId()).toBe('shared:c1');
    // The console is not sent it: the compendium reads the source like any other.
    expect(messages.map((m) => m.type)).toEqual(['campaign']);

    // The same hash again fetches nothing.
    net.all[0]!.receive({ type: 'shared', hash: 'h1' });
    await service.settled();
    expect(fetchShared).toHaveBeenCalledOnce();

    // The GM unshares everything: the copy goes, with no fetch.
    net.all[0]!.receive({ type: 'shared', hash: '' });
    await service.settled();
    expect(await store.sharedHash('c1')).toBe('');
    expect(fetchShared).toHaveBeenCalledOnce();
    expect(shared).toEqual(['c1:0', 'c1:1', 'c1:0']);

    service.close('c1');
    expect(service.openSharedSourceId()).toBeNull();
  });

  it('keeps what it has when the table will not hand the content over', async () => {
    const { service, net } = await setup();
    const store = new JoinedStore(await LibraryStore.open(root));
    await service.open('c1');
    net.all[0]!.receive(campaign);
    // No token yet: nothing to prove the device with, so nothing is asked.
    net.all[0]!.receive({ type: 'shared', hash: 'h1' });
    await service.settled();
    expect(fetchShared).not.toHaveBeenCalled();
    net.all[0]!.receive({ type: 'token', token: 'secret', campaignId: 'c1' });
    net.all[0]!.receive({ type: 'shared', hash: 'h1' });
    await service.settled();
    expect(fetchShared).toHaveBeenCalledOnce();
    expect(await store.sharedHash('c1')).toBe('');
    expect(shared).toEqual(['c1:0']);
  });

  it('keeps what the table last showed, for the next time the table is not up', async () => {
    const { service, net } = await setup();
    expect(await service.lastView('c1')).toBeNull();
    await service.open('c1');
    net.all[0]!.receive(campaign);
    net.all[0]!.receive(state('Brannoc'));
    net.all[0]!.receive(state('Brannoc Hale'));
    // At once from memory, then from the cache after the campaign closes.
    expect((await service.lastView('c1'))?.view.mine[0]?.name).toBe('Brannoc Hale');
    service.close('c1');
    await service.settled();
    const kept = JSON.parse(await readFile(join(cache, 'c1', 'last-view.json'), 'utf8')) as {
      view: { type?: string };
    };
    expect(kept.view.type).toBeUndefined();

    // A new run of the app, with the table down, still has it.
    const again = await setup();
    const last = await again.service.lastView('c1');
    expect(last?.view.mine[0]?.name).toBe('Brannoc Hale');
    expect(Number.isNaN(Date.parse(last!.at))).toBe(false);
    expect(await again.service.lastView('c2')).toBeNull();
    expect(await again.service.lastView('../c1')).toBeNull();
  });

  it('treats a damaged cache as nothing seen', async () => {
    const { service } = await setup();
    await mkdir(join(cache, 'c1'), { recursive: true });
    for (const junk of ['{', 'null', '{"view":{"mine":"x"},"at":"2026-01-01T00:00:00.000Z"}']) {
      await writeFile(join(cache, 'c1', 'last-view.json'), junk, 'utf8');
      expect(await service.lastView('c1')).toBeNull();
    }
  });

  it('takes the picture cache with it when the campaign is left', async () => {
    const { service, net } = await setup();
    await service.open('c1');
    net.all[0]!.receive(campaign);
    net.all[0]!.receive(state('Brannoc'));
    await service.picture('c1', '/t/tok/art');
    await service.leave('c1');
    expect(net.all[0]!.closed).toBe(true);
    expect(await service.picture('c1', '/t/tok/art')).toBeNull();
    expect(await service.lastView('c1')).toBeNull();
    expect(await service.list()).toEqual([]);
  });
});
