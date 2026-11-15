import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dnsPacket from 'dns-packet';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryStore } from '../library/LibraryStore';
import { lanAddresses, listenOnFirstFreePort, type LanAddress } from './listen';
import { answerFor, candidateName, isConflict, sameSubnet } from './mdns';
import { hashPin, hashToken, pinMatches, PlayersStore, tokenMatches } from './players';

const wifi: LanAddress = {
  host: '192.168.1.23',
  family: 'IPv4',
  iface: 'Wi-Fi',
  netmask: '255.255.255.0',
};
const hyperV: LanAddress = {
  host: '172.20.48.1',
  family: 'IPv4',
  iface: 'vEthernet (WSL)',
  netmask: '255.255.240.0',
};
const v6: LanAddress = {
  host: 'fe80::1c2d%12',
  family: 'IPv6',
  iface: 'Wi-Fi',
  netmask: 'ffff:ffff:ffff:ffff::',
};

describe('device tokens', () => {
  it('stores a hash and compares in constant time', () => {
    const hash = hashToken('abc');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenMatches('abc', hash)).toBe(true);
    expect(tokenMatches('abd', hash)).toBe(false);
  });
});

describe('PlayersStore', () => {
  let root: string;
  let store: LibraryStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-players-'));
    store = await LibraryStore.open(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('claims for a new device, saves only the hash, and finds the device by its token', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    const { device, token } = await players.claim('pc', 'brannoc', null, "Sam's phone");
    expect(token).toBeTruthy();
    const disk = await readFile(join(root, 'campaigns/g/players.json'), 'utf8');
    expect(disk).not.toContain(token!);
    expect(disk).toContain(hashToken(token!));
    const again = await PlayersStore.open(store, 'campaigns/g/players.json');
    expect(again.deviceForToken(token!)?.deviceId).toBe(device.deviceId);
    expect(again.deviceForToken('nope')).toBeNull();
    expect(again.claimOf('pc', 'brannoc')?.deviceId).toBe(device.deviceId);
  });

  it('adds a second claim to an existing device without a new token', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    const first = await players.claim('pc', 'brannoc', null, '');
    const second = await players.claim('npc', 'tobin', first.device, '');
    expect(second.token).toBeNull();
    expect(players.devices).toHaveLength(1);
    expect(players.claims).toHaveLength(2);
  });

  it('refuses a claim on a claimed creature', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    await players.claim('pc', 'brannoc', null, '');
    await expect(players.claim('pc', 'brannoc', null, '')).rejects.toThrow();
  });

  it('releases one creature or all, keeping the device', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    const { device } = await players.claim('pc', 'brannoc', null, '');
    await players.claim('pc', 'wren', device, '');
    expect(await players.release({ kind: 'pc', id: 'brannoc' })).toBe(true);
    expect(players.claims.map((c) => c.creatureId)).toEqual(['wren']);
    expect(await players.release({ kind: 'pc', id: 'brannoc' })).toBe(false);
    expect(await players.release('all')).toBe(true);
    expect(players.claims).toEqual([]);
    expect(players.devices).toHaveLength(1);
  });

  it('starts empty from a missing or broken file', async () => {
    await store.writeText('campaigns/g/players.json', '{ nope');
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    expect(players.devices).toEqual([]);
  });

  it('keeps a PIN only as a salted hash, and checks it', async () => {
    const stored = hashPin('0042');
    expect(stored).not.toContain('0042');
    expect(hashPin('0042')).not.toBe(stored);
    expect(pinMatches('0042', stored)).toBe(true);
    expect(pinMatches('0043', stored)).toBe(false);
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    await players.claim('pc', 'brannoc', null, '', new Date(), { pin: '0042' });
    const disk = await readFile(join(root, 'campaigns/g/players.json'), 'utf8');
    expect(disk).not.toContain('"0042"');
    expect(pinMatches('0042', players.claimOf('pc', 'brannoc')!.pinHash!)).toBe(true);
  });

  it('moves a claim on a takeover, keeping its PIN, and says where it came from', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    const first = await players.claim('pc', 'brannoc', null, 'Old', new Date(), { pin: '1234' });
    const taken = await players.claim('pc', 'brannoc', null, 'New', new Date(), { takeOver: true });
    expect(taken.from).toBe(first.device.deviceId);
    expect(taken.token).toBeTruthy();
    expect(players.claims).toHaveLength(1);
    expect(players.claimOf('pc', 'brannoc')!.deviceId).toBe(taken.device.deviceId);
    expect(pinMatches('1234', players.claimOf('pc', 'brannoc')!.pinHash!)).toBe(true);
  });

  it('releases a whole device for Switch character, keeping the device', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    const { device } = await players.claim('pc', 'brannoc', null, '');
    await players.claim('npc', 'tobin', device, '');
    const released = await players.releaseDevice(device.deviceId);
    expect(released.map((c) => c.creatureId)).toEqual(['brannoc', 'tobin']);
    expect(players.claims).toEqual([]);
    expect(players.devices).toHaveLength(1);
  });

  it('saves movement locks, for everyone and per creature', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    expect(players.movement).toEqual({ all: false, creatures: [] });
    await players.setMovementLock('pc:brannoc', true);
    await players.setMovementLock('all', true);
    const again = await PlayersStore.open(store, 'campaigns/g/players.json');
    expect(again.movement).toEqual({ all: true, creatures: ['pc:brannoc'] });
    await again.setMovementLock('pc:brannoc', false);
    expect(again.movement.creatures).toEqual([]);
  });

  it('saves the reclaim mode with the campaign', async () => {
    const players = await PlayersStore.open(store, 'campaigns/g/players.json');
    expect(players.reclaimMode).toBe('open');
    await players.setReclaimMode('approval');
    const again = await PlayersStore.open(store, 'campaigns/g/players.json');
    expect(again.reclaimMode).toBe('approval');
  });
});

describe('lanAddresses', () => {
  it('keeps private addresses, real adapters and 192.168 first', () => {
    const list = lanAddresses({
      'vEthernet (WSL)': [
        {
          address: '172.20.48.1',
          netmask: '255.255.240.0',
          family: 'IPv4',
          mac: '',
          internal: false,
          cidr: null,
        },
      ],
      'Wi-Fi': [
        {
          address: '192.168.1.23',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '',
          internal: false,
          cidr: null,
        },
        {
          address: 'fe80::1c2d',
          netmask: 'ffff:ffff:ffff:ffff::',
          family: 'IPv6',
          mac: '',
          internal: false,
          cidr: null,
          scopeid: 12,
        },
        {
          address: '2001:db8::5',
          netmask: 'ffff:ffff:ffff:ffff::',
          family: 'IPv6',
          mac: '',
          internal: false,
          cidr: null,
          scopeid: 0,
        },
      ],
      Loopback: [
        {
          address: '127.0.0.1',
          netmask: '255.0.0.0',
          family: 'IPv4',
          mac: '',
          internal: true,
          cidr: null,
        },
      ],
      Ethernet: [
        {
          address: '8.8.4.4',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '',
          internal: false,
          cidr: null,
        },
      ],
    });
    expect(list.map((a) => a.host)).toEqual(['192.168.1.23', '172.20.48.1', 'fe80::1c2d%12']);
  });
});

describe('listenOnFirstFreePort', () => {
  const fakeBind =
    (refuse: Record<number, string>, log: string[] = []) =>
    (host: string, port: number) => {
      const code = refuse[port];
      if (code && !host.includes(':')) {
        return Promise.reject(Object.assign(new Error(code), { code }));
      }
      if (host.includes(':') && refuse[-1]) return Promise.reject(new Error('no v6'));
      log.push(`${host}:${port}`);
      return Promise.resolve({ host, close: () => Promise.resolve() });
    };

  it('takes port 80 when it is free', async () => {
    const r = await listenOnFirstFreePort([wifi, hyperV, v6], [80, 8130], fakeBind({}));
    expect(r.port).toBe(80);
    expect(r.listeners.map((l) => l.host)).toEqual([wifi.host, hyperV.host, v6.host]);
  });

  it('moves on when 80 is in use or refused', async () => {
    expect(
      (await listenOnFirstFreePort([wifi], [80, 8130], fakeBind({ 80: 'EADDRINUSE' }))).port,
    ).toBe(8130);
    expect((await listenOnFirstFreePort([wifi], [80, 8130], fakeBind({ 80: 'EACCES' }))).port).toBe(
      8130,
    );
  });

  it('fails when every port is taken, or there is no private address', async () => {
    await expect(
      listenOnFirstFreePort([wifi], [80, 8130], fakeBind({ 80: 'EADDRINUSE', 8130: 'EADDRINUSE' })),
    ).rejects.toThrow(/No free port/);
    await expect(listenOnFirstFreePort([v6], [80], fakeBind({}))).rejects.toThrow(/Wi-Fi/);
  });

  it('skips an IPv6 address that will not bind', async () => {
    const r = await listenOnFirstFreePort([wifi, v6], [80], fakeBind({ [-1]: 'x' }));
    expect(r.skipped).toEqual([v6.host]);
  });
});

describe('mDNS responder', () => {
  const query = (type: string, id = 0) => ({
    id,
    questions: [{ name: 'trifold.local', type } as never],
  });

  it('answers A with the address on the asker’s subnet, multicast style', () => {
    const r = answerFor(query('A'), { address: '192.168.1.40', port: 5353 }, 'trifold.local', [
      hyperV,
      wifi,
    ]);
    expect(r?.id).toBe(0);
    expect(r?.questions).toBeUndefined();
    expect(r?.answers).toEqual([
      expect.objectContaining({ type: 'A', data: '192.168.1.23', ttl: 120 }),
    ]);
  });

  it('answers a legacy unicast query with its id, question and a short TTL', () => {
    const r = answerFor(
      query('A', 4242),
      { address: '192.168.1.40', port: 50123 },
      'trifold.local',
      [wifi],
    );
    expect(r?.id).toBe(4242);
    expect(r?.questions).toHaveLength(1);
    expect(r?.answers[0]).toMatchObject({ ttl: 10, data: '192.168.1.23' });
    // It encodes to a valid packet.
    const decoded = dnsPacket.decode(dnsPacket.encode(r as never));
    expect(decoded.id).toBe(4242);
    expect((decoded.answers?.[0] as { data?: unknown } | undefined)?.data).toBe('192.168.1.23');
  });

  it('answers AAAA with link-local addresses, or NSEC when there are none', () => {
    const r = answerFor(query('AAAA'), { address: '192.168.1.40', port: 5353 }, 'trifold.local', [
      wifi,
      v6,
    ]);
    expect(r?.answers).toEqual([expect.objectContaining({ type: 'AAAA', data: 'fe80::1c2d' })]);
    const none = answerFor(
      query('AAAA'),
      { address: '192.168.1.40', port: 5353 },
      'trifold.local',
      [wifi],
    );
    expect(none?.answers[0]?.type).toBe('NSEC');
    expect(() => dnsPacket.encode(none as never)).not.toThrow();
  });

  it('ignores other names and types', () => {
    expect(
      answerFor(
        { id: 0, questions: [{ name: 'printer.local', type: 'A' }] },
        { address: '192.168.1.4', port: 5353 },
        'trifold.local',
        [wifi],
      ),
    ).toBeNull();
    expect(
      answerFor(query('TXT'), { address: '192.168.1.4', port: 5353 }, 'trifold.local', [wifi]),
    ).toBeNull();
  });

  it('sees another host holding the name as a conflict, and its own answer as none', () => {
    const theirs = {
      answers: [{ type: 'A' as const, name: 'trifold.local', data: '192.168.1.99' }],
    };
    const ours = { answers: [{ type: 'A' as const, name: 'trifold.local', data: '192.168.1.23' }] };
    expect(isConflict(theirs, 'trifold.local', [wifi])).toBe(true);
    expect(isConflict(ours, 'trifold.local', [wifi])).toBe(false);
    expect(candidateName(1)).toBe('trifold.local');
    expect(candidateName(2)).toBe('trifold-2.local');
  });

  it('matches subnets', () => {
    expect(sameSubnet('192.168.1.200', wifi)).toBe(true);
    expect(sameSubnet('192.168.2.1', wifi)).toBe(false);
    expect(sameSubnet('172.20.50.9', hyperV)).toBe(true);
  });
});
