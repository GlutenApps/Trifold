import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServerMessage } from '@trifold/api';
import { LibraryStore } from '../library/LibraryStore';
import {
  formatTableAddress,
  LanClient,
  parseTableAddress,
  type LanClientOptions,
  type LanLink,
  type LanSocket,
} from './lanClient';
import { cleanShared, JoinedStore, sharedSourceId } from './store';

describe('parseTableAddress', () => {
  it('reads what a GM’s Trifold shows, and what joined.json keeps', () => {
    expect(parseTableAddress('trifold.local')).toEqual({ host: 'trifold.local', port: 80 });
    expect(parseTableAddress(' http://192.168.1.23:8130/ ')).toEqual({
      host: '192.168.1.23',
      port: 8130,
    });
    expect(parseTableAddress('Trifold-2.local:8131')).toEqual({
      host: 'trifold-2.local',
      port: 8131,
    });
    expect(parseTableAddress('[fd00::23]:8130')).toEqual({ host: 'fd00::23', port: 8130 });
    expect(formatTableAddress({ host: 'fd00::23', port: 8130 })).toBe('[fd00::23]:8130');
    expect(formatTableAddress({ host: '10.0.0.4', port: 80 })).toBe('10.0.0.4:80');
  });

  it('refuses anything that is not on the local network', () => {
    for (const bad of [
      '',
      '8.8.8.8',
      'http://203.0.113.5:8130',
      'example.com',
      'trifold.local.example.com',
      'localhost',
      '127.0.0.1',
      '192.168.1.23:0',
      '192.168.1.23:70000',
      '[2001:db8::1]:8130',
    ]) {
      expect(parseTableAddress(bad), bad).toBeNull();
    }
    // A path after the address is dropped, never followed.
    expect(parseTableAddress('192.168.1.23:8130/ws?x=1')).toEqual({
      host: '192.168.1.23',
      port: 8130,
    });
  });
});

describe('JoinedStore', () => {
  let root: string;
  let joined: JoinedStore;
  const T = new Date('2026-11-23T18:00:00.000Z');

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-joined-'));
    joined = new JoinedStore(await LibraryStore.open(root));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('keeps a joined campaign in its own folder, named by the GM’s campaign id', async () => {
    const made = await joined.join({
      campaignId: '01HZXGREYFORD',
      campaignName: 'The Lantern at Greyford',
      displayName: '  Sam  ',
      address: '192.168.1.23:8130',
      now: T,
    });
    expect(made).toMatchObject({
      schemaVersion: 1,
      displayName: 'Sam',
      addresses: ['192.168.1.23:8130'],
      characterId: null,
      joinedAt: T.toISOString(),
      lastLiveAt: null,
    });
    expect(await readdir(join(root, 'joined', '01HZXGREYFORD'))).toEqual(['joined.json']);
    expect(await joined.list()).toEqual([made]);
  });

  it('keeps the claim and the character when the campaign is joined again', async () => {
    await joined.join({ campaignId: 'c1', campaignName: 'Old name', displayName: 'Sam', now: T });
    await joined.update('c1', { deviceToken: 'secret', characterId: 'ch1' });
    const again = await joined.join({
      campaignId: 'c1',
      campaignName: 'New name',
      displayName: 'Sam',
      address: 'trifold.local:80',
    });
    expect(again).toMatchObject({
      campaignName: 'New name',
      deviceToken: 'secret',
      characterId: 'ch1',
      joinedAt: T.toISOString(),
      addresses: ['trifold.local:80'],
    });
  });

  it('remembers the addresses that worked, the latest first, and when it was live', async () => {
    await joined.join({ campaignId: 'c1', campaignName: 'A', displayName: '', now: T });
    for (const a of ['10.0.0.1:80', '10.0.0.2:80', '10.0.0.1:80', '10.0.0.3:80', '10.0.0.4:80']) {
      await joined.connected('c1', a, T);
    }
    await joined.connected('c1', 'not an address', T);
    const now = await joined.get('c1');
    expect(now?.addresses).toEqual(['10.0.0.4:80', '10.0.0.3:80', '10.0.0.1:80', '10.0.0.2:80']);
    expect(now?.lastLiveAt).toBe(T.toISOString());
    expect(await joined.connected('nope', '10.0.0.1:80')).toBeNull();
  });

  it('lists the most recently live first, and skips what it cannot read', async () => {
    await joined.join({ campaignId: 'b', campaignName: 'Beta', displayName: '', now: T });
    await joined.join({ campaignId: 'a', campaignName: 'Alpha', displayName: '', now: T });
    await joined.join({ campaignId: 'c', campaignName: 'Gamma', displayName: '', now: T });
    await joined.connected('c', '10.0.0.1:80', T);
    await mkdir(join(root, 'joined', 'broken'), { recursive: true });
    await writeFile(join(root, 'joined', 'broken', 'joined.json'), '{ not json');
    // A folder whose file names another campaign is not listed as either.
    await mkdir(join(root, 'joined', 'copy'), { recursive: true });
    await writeFile(
      join(root, 'joined', 'copy', 'joined.json'),
      JSON.stringify(await joined.get('a')),
    );
    expect((await joined.list()).map((j) => j.campaignName)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('refuses a campaign id that is not a plain folder name', async () => {
    for (const id of ['../escape', 'a/b', '', '..', 'a b']) {
      await expect(
        joined.join({ campaignId: id, campaignName: 'x', displayName: '' }),
      ).rejects.toThrow();
      await expect(joined.leave(id)).rejects.toThrow();
    }
    expect(await joined.get('../escape')).toBeNull();
  });

  it('leaves a campaign by removing its whole folder', async () => {
    await joined.join({ campaignId: 'c1', campaignName: 'A', displayName: '', now: T });
    await mkdir(join(root, 'joined', 'c1', 'notes'), { recursive: true });
    await joined.leave('c1');
    expect(await joined.list()).toEqual([]);
    expect(await readdir(join(root, 'joined'))).toEqual([]);
    await joined.leave('c1');
  });

  const noteInput = (title: string, extra: object = {}) =>
    ({
      schemaVersion: 1,
      id: '',
      kind: 'note',
      title,
      body: '',
      tags: [],
      links: [],
      parentId: null,
      order: 0,
      createdAt: '',
      updatedAt: '',
      ...extra,
    }) as never;

  it('keeps the player’s notes in the joined campaign, flat and newest first', async () => {
    await joined.join({ campaignId: 'c1', campaignName: 'A', displayName: '', now: T });
    expect(await joined.notes('c1')).toEqual([]);
    const first = await joined.saveNote(
      'c1',
      noteInput('  The   ferryman  ', {
        capture: { at: '2026-11-23T18:00:00.000Z' },
        // A player's notes have no folders, whatever the renderer sends.
        kind: 'folder',
        parentId: 'elsewhere',
        role: 'quickNotes',
      }),
    );
    expect(first).toMatchObject({ title: 'The ferryman', kind: 'note', parentId: null });
    expect(first.role).toBeUndefined();
    const second = await joined.saveNote(
      'c1',
      noteInput('Owes us a favour', { capture: { at: '2026-11-23T19:00:00.000Z' } }),
    );
    expect(await readdir(join(root, 'joined', 'c1', 'notes'))).toHaveLength(2);
    expect((await joined.notes('c1')).map((n) => n.title)).toEqual([
      'Owes us a favour',
      'The ferryman',
    ]);

    // Saving again changes the same file.
    await joined.saveNote('c1', { ...first, body: 'Paid in silver.' });
    expect((await joined.notes('c1')).find((n) => n.id === first.id)?.body).toBe('Paid in silver.');
    expect(await readdir(join(root, 'joined', 'c1', 'notes'))).toHaveLength(2);

    await joined.removeNote('c1', second.id);
    expect((await joined.notes('c1')).map((n) => n.id)).toEqual([first.id]);
    await expect(joined.saveNote('c1', noteInput('   '))).rejects.toThrow('title');
  });

  it('keeps the rolls the player pinned, and renames one in place', async () => {
    await joined.join({ campaignId: 'c1', campaignName: 'A', displayName: '', now: T });
    const pin = await joined.savePinnedRoll('c1', {
      schemaVersion: 1,
      id: '',
      name: '2d6+1',
      label: '2d6+1',
      expression: '2d6+1',
      total: 9,
      faces: '2d6: 5, 3',
      kind: 'dice',
      source: 'pool',
      rolledAt: T.toISOString(),
      createdAt: '',
      updatedAt: '',
    } as never);
    expect(pin.id).not.toBe('');
    await joined.savePinnedRoll('c1', { ...pin, name: 'Greatsword' });
    expect(await joined.pinnedRolls('c1')).toMatchObject([{ id: pin.id, name: 'Greatsword' }]);
    await joined.removePinnedRoll('c1', pin.id);
    expect(await joined.pinnedRolls('c1')).toEqual([]);
  });

  const sharedRecord = (id: string, extra: object = {}) => ({
    schemaVersion: 1,
    id: `shared:c1:${id}`,
    kind: 'feat',
    key: id,
    name: id,
    displayName: id,
    sourceId: 'shared:c1',
    edition: '2024',
    tags: [],
    data: { text: 'Text.' },
    sharedFrom: { sourceName: 'A book', nonSrd: true },
    ...extra,
  });

  it('keeps what a GM shared as one read-only source in the joined campaign', async () => {
    await joined.join({ campaignId: 'c1', campaignName: 'Greyford', displayName: '', now: T });
    expect(await joined.sharedHash('c1')).toBe('');
    expect(await joined.sharedSources()).toEqual([]);

    const records = cleanShared('c1', [sharedRecord('ward'), sharedRecord('veil')]);
    const source = await joined.writeShared('c1', { hash: 'h1', records });
    expect(source).toMatchObject({
      id: sharedSourceId('c1'),
      kind: 'shared',
      name: 'Shared in Greyford',
      fileHash: 'h1',
      campaignIds: ['c1'],
      license: { nonSrd: true },
      recordCounts: { feat: 2 },
    });
    expect((await readdir(join(root, 'joined', 'c1', 'shared'))).sort()).toEqual([
      'records.jsonl',
      'source.json',
    ]);
    expect(await joined.sharedHash('c1')).toBe('h1');
    expect((await joined.sharedSources()).map((s) => s.id)).toEqual(['shared:c1']);
    expect((await joined.sharedRecords('shared:c1')).map((r) => r.key)).toEqual(['ward', 'veil']);
    // Another campaign's source, or anything that is not one, reads as nothing.
    expect(await joined.sharedRecords('shared:c2')).toEqual([]);
    expect(await joined.sharedRecords('shared:../c1')).toEqual([]);
    expect(await joined.sharedRecords('homebrew')).toEqual([]);

    await joined.removeShared('c1');
    expect(await joined.sharedHash('c1')).toBe('');
    expect(await joined.sharedSources()).toEqual([]);
    await expect(joined.writeShared('nope', { hash: 'h', records })).rejects.toThrow('not joined');
  });

  it('keeps only records that belong under the campaign’s own shared source', () => {
    const kept = cleanShared('c1', [
      sharedRecord('ward'),
      // The same id twice is one record.
      sharedRecord('ward', { name: 'again' }),
      // Aimed at the player's own homebrew, or at another campaign's shared source.
      sharedRecord('x', { id: 'hb-mine', sourceId: 'homebrew' }),
      sharedRecord('y', { sourceId: 'shared:c2' }),
      sharedRecord('z', { id: 'shared:c2:z' }),
      // Not a record at all.
      { id: 'shared:c1:junk', sourceId: 'shared:c1' },
      'text',
      null,
    ]);
    expect(kept.map((r) => r.id)).toEqual(['shared:c1:ward']);
    expect(kept[0]!.name).toBe('ward');
  });

  it('writes nothing into a campaign that was left, and refuses ids that are not plain names', async () => {
    await expect(joined.saveNote('c1', noteInput('Late'))).rejects.toThrow('not joined');
    await expect(joined.savePinnedRoll('c1', { name: 'x' } as never)).rejects.toThrow('not joined');
    expect(await readdir(root)).not.toContain('joined');
    await joined.join({ campaignId: 'c1', campaignName: 'A', displayName: '', now: T });
    await expect(joined.removeNote('c1', '../joined')).rejects.toThrow();
    await expect(joined.saveNote('c1', noteInput('Up', { id: '../../up' }))).rejects.toThrow();
    await expect(joined.notes('../c1')).rejects.toThrow();
    expect(await joined.get('c1')).not.toBeNull();
  });
});

describe('LanClient', () => {
  function harness(extra: Partial<LanClientOptions> = {}, remote = '192.168.1.23') {
    const sockets: Array<{
      url: string;
      origin: string;
      sent: unknown[];
      closed: boolean;
      open(): void;
      receive(msg: ServerMessage | string): void;
      drop(): void;
    }> = [];
    const links: LanLink[] = [];
    const messages: string[] = [];
    const tokens: string[] = [];
    const timers: Array<{ run: () => void; ms: number }> = [];
    const client = new LanClient({
      endpoint: { host: '192.168.1.23', port: 8130 },
      campaignId: 'c1',
      onLink: (l) => links.push(l),
      onMessage: (m) => messages.push(m.type),
      onToken: (t) => tokens.push(t),
      setTimer: (run, ms) => timers.push({ run, ms }),
      clearTimer: () => undefined,
      open: (url, origin) => {
        let onOpen = () => undefined as void;
        let onMessage = (_text: string) => undefined as void;
        let onClose = () => undefined as void;
        const record = {
          url,
          origin,
          sent: [] as unknown[],
          closed: false,
          open: () => onOpen(),
          receive: (msg: ServerMessage | string) =>
            onMessage(typeof msg === 'string' ? msg : JSON.stringify(msg)),
          drop: () => onClose(),
        };
        sockets.push(record);
        const socket: LanSocket = {
          onOpen: (l) => void (onOpen = l),
          onMessage: (l) => void (onMessage = l),
          onClose: (l) => void (onClose = l),
          send: (text) => void record.sent.push(JSON.parse(text)),
          close: () => {
            if (record.closed) return;
            record.closed = true;
            onClose();
          },
          remoteAddress: () => remote,
        };
        return socket;
      },
      ...extra,
    });
    const campaign = (campaignId = 'c1'): ServerMessage => ({
      type: 'campaign',
      campaignId,
      campaignName: 'Greyford',
      now: 1,
      protocol: 1,
    });
    return { client, sockets, links, messages, tokens, timers, campaign };
  }

  it('connects as the table’s own page would, and greets with its token', () => {
    const h = harness({ token: 'secret' });
    h.client.start();
    h.client.start();
    expect(h.sockets).toHaveLength(1);
    expect(h.sockets[0]).toMatchObject({
      url: 'ws://192.168.1.23:8130/ws',
      origin: 'http://192.168.1.23:8130',
    });
    h.sockets[0]!.open();
    h.sockets[0]!.receive(h.campaign());
    expect(h.sockets[0]!.sent).toEqual([{ type: 'hello', token: 'secret' }]);
    expect(h.links).toEqual(['open']);
    h.client.send({ type: 'switch' });
    expect(h.sockets[0]!.sent[1]).toEqual({ type: 'switch' });
  });

  it('keeps a new token, and uses it after a reconnect', () => {
    const h = harness();
    h.client.start();
    h.sockets[0]!.open();
    h.sockets[0]!.receive(h.campaign());
    expect(h.sockets[0]!.sent).toEqual([{ type: 'hello' }]);
    h.sockets[0]!.receive({ type: 'token', token: 'fresh', campaignId: 'c1' });
    // A token for some other campaign is not this one's claim.
    h.sockets[0]!.receive({ type: 'token', token: 'other', campaignId: 'c2' });
    expect(h.tokens).toEqual(['fresh']);

    h.sockets[0]!.drop();
    expect(h.links).toEqual(['open', 'reconnecting']);
    expect(h.timers[0]?.ms).toBe(1000);
    h.timers[0]!.run();
    h.sockets[1]!.open();
    h.sockets[1]!.receive(h.campaign());
    expect(h.sockets[1]!.sent).toEqual([{ type: 'hello', token: 'fresh' }]);
  });

  it('says nothing to a table that is up with another campaign, and looks again later', () => {
    const h = harness({ token: 'secret' });
    h.client.start();
    h.sockets[0]!.open();
    h.sockets[0]!.receive(h.campaign('someone-elses'));
    expect(h.sockets[0]!.sent).toEqual([]);
    expect(h.sockets[0]!.closed).toBe(true);
    expect(h.links).toEqual(['otherCampaign']);
    expect(h.messages).toEqual([]);
    expect(h.timers[0]?.ms).toBe(5000);
  });

  it('says nothing to a table on another protocol, says who must update, and looks again slowly', () => {
    const h = harness({ token: 'secret' });
    h.client.start();
    h.sockets[0]!.open();
    h.sockets[0]!.receive({ ...h.campaign(), protocol: 99, appVersion: '9.0.0' } as ServerMessage);
    expect(h.sockets[0]!.sent).toEqual([]);
    expect(h.links).toEqual(['playerUpdate']);
    expect(h.timers[0]?.ms).toBe(30_000);
    h.timers[0]!.run();
    h.sockets[1]!.open();
    // A table older than the check sends no protocol: the GM has to update.
    const { protocol: _old, ...older } = h.campaign() as ServerMessage & { protocol?: number };
    h.sockets[1]!.receive(older as ServerMessage);
    expect(h.links).toEqual(['playerUpdate', 'gmUpdate']);
    expect(h.sockets[1]!.sent).toEqual([]);
  });

  it('sends and passes on nothing before the table has named the campaign', () => {
    const h = harness();
    h.client.start();
    h.sockets[0]!.open();
    h.client.send({ type: 'switch' });
    h.sockets[0]!.receive({ type: 'error', message: 'early' });
    h.sockets[0]!.receive('not json');
    h.sockets[0]!.receive('null');
    expect(h.sockets[0]!.sent).toEqual([]);
    expect(h.messages).toEqual([]);
  });

  it('reports a table the DM closed as stopped, and keeps looking slowly', () => {
    const h = harness();
    h.client.start();
    h.sockets[0]!.open();
    h.sockets[0]!.receive(h.campaign());
    h.sockets[0]!.receive({ type: 'closed' });
    h.sockets[0]!.drop();
    expect(h.links).toEqual(['open', 'stopped']);
    expect(h.messages).toEqual(['campaign', 'closed']);
    expect(h.timers[0]?.ms).toBe(5000);
  });

  it('drops a name that resolved to an address outside the local network', () => {
    const h = harness({ endpoint: { host: 'trifold.local', port: 80 } }, '203.0.113.5');
    h.client.start();
    expect(h.sockets[0]!.url).toBe('ws://trifold.local/ws');
    h.sockets[0]!.open();
    expect(h.links).toEqual(['refused']);
    expect(h.sockets[0]!.closed).toBe(true);
    expect(h.timers).toEqual([]);
  });

  it('stops for good: no retry, nothing sent', () => {
    const h = harness();
    h.client.start();
    h.sockets[0]!.open();
    h.sockets[0]!.receive(h.campaign());
    h.client.stop();
    expect(h.sockets[0]!.closed).toBe(true);
    expect(h.timers).toEqual([]);
    expect(h.links).toEqual(['open']);
    h.client.send({ type: 'switch' });
    expect(h.sockets[0]!.sent).toEqual([{ type: 'hello' }]);
  });
});
