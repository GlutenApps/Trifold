import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Packet } from 'dns-packet';
import type { LanAddress } from '../table/listen';
import {
  parseTableServices,
  serviceAnswerFor,
  serviceInstance,
  TABLE_SERVICE,
  type TableService,
} from '../table/mdns';
import {
  FoundTables,
  QUERY_DELAYS_MS,
  REQUERY_MS,
  STALE_MS,
  TableDiscovery,
  type MdnsSocket,
} from './discovery';

const wifi: LanAddress = {
  host: '192.168.1.23',
  family: 'IPv4',
  iface: 'Wi-Fi',
  netmask: '255.255.255.0',
};
const hyperV: LanAddress = {
  host: '172.20.0.1',
  family: 'IPv4',
  iface: 'vEthernet',
  netmask: '255.255.240.0',
};
const service: TableService = {
  port: 8130,
  campaignId: '01HZXGREYFORD',
  campaignName: 'The Lantern at Greyford',
};
const ask = (name: string, type: string, id = 0) => ({
  id,
  questions: [{ name, type } as never],
});
const multicast = { address: '192.168.1.40', port: 5353 };

/** What the GM's responder would send for a PTR question, as a client receives it. */
const offer = (name = 'trifold.local', s: TableService = service) =>
  serviceAnswerFor(ask(TABLE_SERVICE, 'PTR'), multicast, name, s, [hyperV, wifi]) as Packet;

describe('the table service (mDNS, DNS-SD)', () => {
  it('answers a PTR question with the instance, and the port, campaign and address beside it', () => {
    const r = serviceAnswerFor(ask(TABLE_SERVICE, 'PTR'), multicast, 'trifold.local', service, [
      hyperV,
      wifi,
    ]);
    expect(r?.id).toBe(0);
    expect(r?.answers).toEqual([
      { type: 'PTR', name: TABLE_SERVICE, ttl: 120, data: 'trifold._trifold._tcp.local' },
    ]);
    expect(r?.additionals).toEqual([
      expect.objectContaining({
        type: 'SRV',
        name: 'trifold._trifold._tcp.local',
        data: { port: 8130, target: 'trifold.local' },
      }),
      expect.objectContaining({
        type: 'TXT',
        data: ['v=1', 'id=01HZXGREYFORD', 'name=The Lantern at Greyford'],
      }),
      // The asker's subnet only, as for the name: not the virtual adapter's address.
      expect.objectContaining({ type: 'A', name: 'trifold.local', data: '192.168.1.23' }),
    ]);
  });

  it('answers SRV and TXT for its own instance, and nothing for anyone else’s', () => {
    const mine = serviceInstance('trifold-2.local');
    expect(mine).toBe('trifold-2._trifold._tcp.local');
    expect(
      serviceAnswerFor(ask(mine, 'SRV'), multicast, 'trifold-2.local', service, [wifi]),
    ).not.toBeNull();
    expect(
      serviceAnswerFor(ask(mine, 'SRV'), multicast, 'trifold.local', service, [wifi]),
    ).toBeNull();
    expect(
      serviceAnswerFor(ask('trifold.local', 'A'), multicast, 'trifold.local', service, [wifi]),
    ).toBeNull();
    expect(
      serviceAnswerFor(ask('_http._tcp.local', 'PTR'), multicast, 'trifold.local', service, [wifi]),
    ).toBeNull();
  });

  it('answers a legacy unicast query with its id, question and a short TTL', () => {
    const r = serviceAnswerFor(
      ask(TABLE_SERVICE, 'PTR', 77),
      { address: '192.168.1.40', port: 40001 },
      'trifold.local',
      service,
      [wifi],
    );
    expect(r?.id).toBe(77);
    expect(r?.questions).toHaveLength(1);
    expect(r?.answers[0]).toMatchObject({ ttl: 10 });
  });

  it('keeps a long campaign name inside one TXT string', () => {
    const long = { ...service, campaignName: 'Ærø '.repeat(120) };
    const r = serviceAnswerFor(ask(TABLE_SERVICE, 'PTR'), multicast, 'trifold.local', long, [wifi]);
    const txt = r?.additionals?.find((a) => a.type === 'TXT');
    const name = (txt?.data as string[]).find((d) => d.startsWith('name='))!;
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(255);
    expect(name.startsWith('name=Ærø Ærø')).toBe(true);
  });
});

describe('parseTableServices', () => {
  it('reads back what the responder sends', () => {
    expect(parseTableServices(offer())).toEqual({
      found: [
        {
          instance: 'trifold._trifold._tcp.local',
          host: 'trifold.local',
          port: 8130,
          addresses: ['192.168.1.23'],
          campaignId: '01HZXGREYFORD',
          campaignName: 'The Lantern at Greyford',
        },
      ],
      gone: [],
    });
  });

  it('reads TXT strings that arrive as buffers, as they do off the wire', () => {
    const packet = offer();
    const wire: Packet = {
      ...packet,
      additionals: packet.additionals!.map((a) =>
        a.type === 'TXT' ? { ...a, data: (a.data as string[]).map((d) => Buffer.from(d)) } : a,
      ),
    };
    expect(parseTableServices(wire).found[0]?.campaignName).toBe('The Lantern at Greyford');
  });

  it('drops a table with no private address, no campaign id or no port', () => {
    const packet = offer();
    const without = (type: string) => ({
      ...packet,
      additionals: packet.additionals!.filter((a) => a.type !== type),
    });
    expect(parseTableServices(without('A')).found).toEqual([]);
    expect(parseTableServices(without('SRV')).found).toEqual([]);
    expect(parseTableServices(without('TXT')).found).toEqual([]);
    // An answer that points a table at a public address is not a table to connect to.
    const elsewhere: Packet = {
      ...packet,
      additionals: packet.additionals!.map((a) => (a.type === 'A' ? { ...a, data: '8.8.8.8' } : a)),
    };
    expect(parseTableServices(elsewhere).found).toEqual([]);
  });

  it('lists IPv4 first and leaves link-local IPv6 out', () => {
    const v6 = (host: string): LanAddress => ({
      host,
      family: 'IPv6',
      iface: 'Wi-Fi',
      netmask: '',
    });
    const packet = serviceAnswerFor(
      ask(TABLE_SERVICE, 'PTR'),
      multicast,
      'trifold.local',
      service,
      [v6('fe80::1%12'), v6('fd00::23'), wifi],
    ) as Packet;
    expect(parseTableServices(packet).found[0]?.addresses).toEqual(['192.168.1.23', 'fd00::23']);
  });

  it('reports a goodbye', () => {
    const bye: Packet = {
      answers: [{ type: 'PTR', name: TABLE_SERVICE, ttl: 0, data: 'trifold._trifold._tcp.local' }],
    };
    expect(parseTableServices(bye)).toEqual({ found: [], gone: ['trifold._trifold._tcp.local'] });
  });

  it('ignores other services', () => {
    const other: Packet = {
      answers: [{ type: 'PTR', name: '_http._tcp.local', ttl: 120, data: 'x._http._tcp.local' }],
    };
    expect(parseTableServices(other)).toEqual({ found: [], gone: [] });
  });
});

describe('FoundTables', () => {
  it('lists each table once, by campaign name, and says when the list changed', () => {
    const tables = new FoundTables();
    expect(tables.take(offer(), 0)).toBe(true);
    expect(tables.take(offer(), 1000)).toBe(false);
    const second = offer('trifold-2.local', { ...service, campaignId: '02', campaignName: 'Ash' });
    expect(tables.take(second, 1000)).toBe(true);
    expect(tables.list().map((t) => t.campaignName)).toEqual(['Ash', 'The Lantern at Greyford']);
    // A renamed campaign is a change.
    expect(tables.take(offer('trifold.local', { ...service, campaignName: 'Renamed' }), 2000)).toBe(
      true,
    );
  });

  it('drops a table on its goodbye, or after it goes quiet', () => {
    const tables = new FoundTables();
    tables.take(offer(), 0);
    tables.take(offer('trifold-2.local', { ...service, campaignId: '02' }), 0);
    const bye: Packet = {
      answers: [{ type: 'PTR', name: TABLE_SERVICE, ttl: 0, data: 'TRIFOLD._trifold._tcp.local' }],
    };
    expect(tables.take(bye, 100)).toBe(true);
    expect(tables.list().map((t) => t.instance)).toEqual(['trifold-2._trifold._tcp.local']);
    expect(tables.sweep(STALE_MS)).toBe(false);
    expect(tables.sweep(STALE_MS + 1)).toBe(true);
    expect(tables.list()).toEqual([]);
  });
});

describe('TableDiscovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fakeSocket() {
    let onResponse: (packet: Packet) => void = () => undefined;
    const socket = {
      queries: 0,
      destroyed: false,
      on(event: string, listener: (arg: never) => void) {
        if (event === 'response') onResponse = listener as (packet: Packet) => void;
      },
      query(q: { questions: Array<{ name: string; type: string }> }) {
        expect(q.questions).toEqual([{ name: TABLE_SERVICE, type: 'PTR' }]);
        socket.queries += 1;
      },
      destroy() {
        socket.destroyed = true;
      },
      respond: (packet: Packet) => onResponse(packet),
    };
    return socket;
  }

  it('asks nothing until started, then asks, listens and keeps asking', () => {
    const socket = fakeSocket();
    const open = vi.fn(() => socket as unknown as MdnsSocket);
    const seen: string[][] = [];
    const discovery = new TableDiscovery(
      (tables) => seen.push(tables.map((t) => t.campaignName)),
      open,
      () => Date.now(),
    );
    expect(open).not.toHaveBeenCalled();
    expect(discovery.running).toBe(false);

    discovery.start();
    discovery.start();
    expect(open).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(QUERY_DELAYS_MS.at(-1)!);
    expect(socket.queries).toBe(QUERY_DELAYS_MS.length);

    socket.respond(offer());
    socket.respond(offer());
    expect(seen).toEqual([['The Lantern at Greyford']]);

    vi.advanceTimersByTime(REQUERY_MS);
    expect(socket.queries).toBe(QUERY_DELAYS_MS.length + 1);
  });

  it('forgets a table that stops answering, and everything when stopped', () => {
    const socket = fakeSocket();
    const seen: number[] = [];
    const discovery = new TableDiscovery(
      (tables) => seen.push(tables.length),
      () => socket as unknown as MdnsSocket,
      () => Date.now(),
    );
    discovery.start();
    socket.respond(offer());
    vi.advanceTimersByTime(STALE_MS + REQUERY_MS);
    expect(seen).toEqual([1, 0]);

    socket.respond(offer());
    expect(discovery.list()).toHaveLength(1);
    const asked = socket.queries;
    discovery.stop();
    expect(socket.destroyed).toBe(true);
    expect(discovery.running).toBe(false);
    expect(discovery.list()).toEqual([]);
    vi.advanceTimersByTime(REQUERY_MS * 3);
    expect(socket.queries).toBe(asked);
  });
});
