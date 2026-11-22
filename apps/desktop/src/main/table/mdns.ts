import makeMdns from 'multicast-dns';
import type { Answer, Packet, Question, StringAnswer } from 'dns-packet';

/** dns-packet's types leave out ANY (255), which it encodes fine. */
const ANY = 'ANY' as unknown as Question['type'];

export interface MdnsResponse {
  type: 'response';
  id: number;
  flags: number;
  questions?: Question[];
  answers: Answer[];
  additionals?: Answer[];
}
import { isPrivateAddress } from '@trifold/rules';
import type { LanAddress } from './listen';

/**
 * The `trifold.local` responder (docs/PLAYER-CONNECTOR.md, "Local name"; ADR 0043). It answers
 * A and AAAA for one name while the table server runs, including legacy unicast queries (RFC
 * 6762 §6.7), which Android's resolver sends. It is a convenience: when multicast is blocked the
 * IP address, Copy link and reclaim still work.
 */

const MDNS_PORT = 5353;
/** Short TTL: the table server only runs for a session, and addresses follow DHCP. */
const TTL = 120;
/** Legacy unicast answers must not be cached for long (RFC 6762 §6.7). */
const LEGACY_TTL = 10;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** Whether `ip` is on the same IPv4 subnet as one of our addresses. */
export function sameSubnet(ip: string, address: LanAddress): boolean {
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(address.host);
  const m = ipv4ToInt(address.netmask);
  if (a === null || b === null || m === null) return false;
  return (a & m) === (b & m);
}

const bareV6 = (host: string) => host.replace(/%.*$/, '');

/**
 * The answer to one query, or null when it does not ask about our name. A records come from the
 * addresses on the asker's subnet when there are any (so a phone is not handed a virtual
 * adapter's address), else every IPv4 address; AAAA records from our IPv6 addresses, or an NSEC
 * saying there are none, so a resolver asking both does not wait out a timeout.
 */
export function answerFor(
  query: Pick<Packet, 'id' | 'questions'>,
  rinfo: { address: string; port: number },
  name: string,
  addresses: readonly LanAddress[],
): MdnsResponse | null {
  const wanted = (query.questions ?? []).filter(
    (q: Question) =>
      q.name.toLowerCase() === name.toLowerCase() &&
      (q.type === 'A' || q.type === 'AAAA' || q.type === ANY),
  );
  if (!wanted.length) return null;
  const legacy = rinfo.port !== MDNS_PORT;
  const ttl = legacy ? LEGACY_TTL : TTL;
  const v4all = addresses.filter((a) => a.family === 'IPv4');
  const local = v4all.filter((a) => sameSubnet(rinfo.address, a));
  const v4 = local.length ? local : v4all;
  const v6 = addresses.filter((a) => a.family === 'IPv6');

  const answers: Answer[] = [];
  const types = new Set(wanted.map((q) => q.type));
  if (types.has('A') || types.has(ANY)) {
    for (const a of v4) answers.push({ type: 'A', name, ttl, flush: !legacy, data: a.host });
  }
  if (types.has('AAAA') || types.has(ANY)) {
    for (const a of v6) {
      answers.push({ type: 'AAAA', name, ttl, flush: !legacy, data: bareV6(a.host) });
    }
  }
  if (!answers.length) {
    answers.push({
      type: 'NSEC',
      name,
      ttl,
      flush: !legacy,
      data: { nextDomain: name, rrtypes: v4.length ? ['A'] : [] },
    });
  }
  return {
    type: 'response',
    // A legacy unicast answer echoes the query id and its question; multicast answers use 0.
    id: legacy ? (query.id ?? 0) : 0,
    flags: 0x8400, // response, authoritative
    ...(legacy ? { questions: wanted } : {}),
    answers,
  };
}

/** Whether a response claims `name` for an address that is not one of ours. */
export function isConflict(
  response: Pick<Packet, 'answers'>,
  name: string,
  addresses: readonly LanAddress[],
): boolean {
  const ours = new Set(addresses.map((a) => bareV6(a.host).toLowerCase()));
  return (response.answers ?? []).some(
    (a) =>
      (a.type === 'A' || a.type === 'AAAA') &&
      a.name.toLowerCase() === name.toLowerCase() &&
      !ours.has(String(a.data).toLowerCase()),
  );
}

/** `trifold.local`, then `trifold-2.local`, `trifold-3.local`… */
export const candidateName = (n: number) => (n <= 1 ? 'trifold.local' : `trifold-${n}.local`);

// ---------- the table as a service (docs/PLAYER-MODE.md, "Table discovery") ----------

/**
 * The name answers "where is trifold.local"; the service answers "which tables are up here".
 * A player's Trifold asks for this type and gets, per table, the port and the campaign, so
 * Join a campaign can list tables and a joined campaign can find its own again after an
 * address or port change. It tells the network nothing the server does not already send to
 * anything that connects (the `campaign` message).
 */
export const TABLE_SERVICE = '_trifold._tcp.local';
/** Bumped when the TXT keys change in a way an older client cannot read. */
export const TABLE_SERVICE_VERSION = '1';

/** What a running table server advertises. */
export interface TableService {
  port: number;
  campaignId: string;
  campaignName: string;
}

/** `trifold.local` → `trifold._trifold._tcp.local`: one instance per host name, so it is unique. */
export const serviceInstance = (hostName: string) =>
  `${hostName.replace(/\.local$/i, '')}.${TABLE_SERVICE}`;

/** A TXT string holds at most 255 bytes; a long campaign name is cut on a character boundary. */
function txtValue(key: string, value: string): string {
  let out = value;
  while (Buffer.byteLength(`${key}=${out}`, 'utf8') > 255) out = [...out].slice(0, -1).join('');
  return `${key}=${out}`;
}

function serviceRecords(
  name: string,
  service: TableService,
  v4: readonly LanAddress[],
  v6: readonly LanAddress[],
  ttl: number,
  flush: boolean,
): { pointer: Answer; details: Answer[] } {
  const instance = serviceInstance(name);
  return {
    // A PTR is shared between every table on the network, so it never carries cache-flush.
    pointer: { type: 'PTR', name: TABLE_SERVICE, ttl, data: instance },
    details: [
      { type: 'SRV', name: instance, ttl, flush, data: { port: service.port, target: name } },
      {
        type: 'TXT',
        name: instance,
        ttl,
        flush,
        data: [
          `v=${TABLE_SERVICE_VERSION}`,
          txtValue('id', service.campaignId),
          txtValue('name', service.campaignName),
        ],
      },
      ...v4.map((a): Answer => ({ type: 'A', name, ttl, flush, data: a.host })),
      ...v6.map((a): Answer => ({ type: 'AAAA', name, ttl, flush, data: bareV6(a.host) })),
    ],
  };
}

/**
 * The answer to a query about the table service, or null when it asks about something else: a
 * PTR question for the service type, or SRV or TXT for our instance. The port, the campaign and
 * the addresses ride along as additional records, so one answer is enough to connect. Addresses
 * follow the same rule as the name's: the asker's subnet first.
 */
export function serviceAnswerFor(
  query: Pick<Packet, 'id' | 'questions'>,
  rinfo: { address: string; port: number },
  name: string,
  service: TableService,
  addresses: readonly LanAddress[],
): MdnsResponse | null {
  const instance = serviceInstance(name).toLowerCase();
  const wanted = (query.questions ?? []).filter((q: Question) => {
    const asked = q.name.toLowerCase();
    if (asked === TABLE_SERVICE) return q.type === 'PTR' || q.type === ANY;
    return asked === instance && (q.type === 'SRV' || q.type === 'TXT' || q.type === ANY);
  });
  if (!wanted.length) return null;
  const legacy = rinfo.port !== MDNS_PORT;
  const v4all = addresses.filter((a) => a.family === 'IPv4');
  const local = v4all.filter((a) => sameSubnet(rinfo.address, a));
  const { pointer, details } = serviceRecords(
    name,
    service,
    local.length ? local : v4all,
    addresses.filter((a) => a.family === 'IPv6'),
    legacy ? LEGACY_TTL : TTL,
    !legacy,
  );
  return {
    type: 'response',
    id: legacy ? (query.id ?? 0) : 0,
    flags: 0x8400,
    ...(legacy ? { questions: wanted } : {}),
    answers: [pointer],
    additionals: details,
  };
}

/** A table found on the network. */
export interface FoundTable {
  /** The service instance, which is what tells two tables apart. */
  instance: string;
  /** The table's local name, `trifold.local`. */
  host: string;
  port: number;
  /** Its private addresses a client can connect to, IPv4 first. Anything else is dropped. */
  addresses: string[];
  campaignId: string;
  campaignName: string;
}

const text = (part: string | Buffer) => (typeof part === 'string' ? part : part.toString('utf8'));

/**
 * The tables a response describes, and the instances it says goodbye to (a PTR with TTL 0). A
 * table counts only when the packet gives its port, its campaign id and at least one private
 * address: the response is from the network, so nothing in it is trusted further than that.
 */
export function parseTableServices(packet: Pick<Packet, 'answers' | 'additionals'>): {
  found: FoundTable[];
  gone: string[];
} {
  const records = [...(packet.answers ?? []), ...(packet.additionals ?? [])];
  const found: FoundTable[] = [];
  const gone: string[] = [];
  for (const ptr of records) {
    if (ptr.type !== 'PTR' || ptr.name.toLowerCase() !== TABLE_SERVICE) continue;
    const instance = ptr.data;
    if (ptr.ttl === 0) {
      gone.push(instance);
      continue;
    }
    const at = (r: Answer) => r.name.toLowerCase() === instance.toLowerCase();
    const srv = records.find((r) => r.type === 'SRV' && at(r));
    const txt = records.find((r) => r.type === 'TXT' && at(r));
    if (srv?.type !== 'SRV' || txt?.type !== 'TXT') continue;
    const fields = new Map<string, string>();
    for (const part of Array.isArray(txt.data) ? txt.data : [txt.data]) {
      const line = text(part);
      const eq = line.indexOf('=');
      if (eq > 0) fields.set(line.slice(0, eq), line.slice(eq + 1));
    }
    const host = srv.data.target;
    const addresses = records
      .filter(
        (r): r is StringAnswer =>
          (r.type === 'A' || r.type === 'AAAA') && r.name.toLowerCase() === host.toLowerCase(),
      )
      // Link-local IPv6 needs the asker's own interface to be usable, so it is left out.
      .filter((r) => isPrivateAddress(r.data) && !/^fe[89ab]/i.test(r.data))
      .sort((a, b) => Number(a.type === 'AAAA') - Number(b.type === 'AAAA'))
      .map((r) => r.data);
    const campaignId = fields.get('id') ?? '';
    const port = srv.data.port;
    if (!campaignId || !addresses.length || !(port >= 1 && port <= 65535)) continue;
    found.push({
      instance,
      host,
      port,
      addresses,
      campaignId,
      campaignName: fields.get('name') ?? '',
    });
  }
  return { found, gone };
}

export class MdnsResponder {
  private mdns: ReturnType<typeof makeMdns> | null = null;
  private name: string | null = null;

  constructor(
    private readonly addresses: () => readonly LanAddress[],
    /** What the table advertises as a service; null while there is nothing to advertise. */
    private readonly service: () => TableService | null = () => null,
  ) {}

  /**
   * Probes for a free name (RFC 6762 §8.1: three queries 250 ms apart; any answer for another
   * address is a conflict), then announces it and answers for it. Resolves to the name won.
   */
  async start(): Promise<string> {
    // Loopback on, so a player's Trifold on this same computer can ask and be answered (two
    // copies side by side, and the smoke test). It changes nothing on the wire. Hearing our own
    // packets is harmless: a probe counts only answers for addresses that are not ours.
    const mdns = makeMdns({ reuseAddr: true, loopback: true });
    this.mdns = mdns;
    await new Promise<void>((resolve, reject) => {
      mdns.once('ready', () => resolve());
      mdns.once('error', reject);
    });
    for (let n = 1; n <= 9; n++) {
      const name = candidateName(n);
      if (!(await this.probe(name))) {
        this.name = name;
        break;
      }
    }
    if (!this.name) throw new Error('trifold.local to trifold-9.local are all taken');
    const name = this.name;
    mdns.on('query', (query, rinfo) => {
      const service = this.service();
      const answers = [
        answerFor(query, rinfo, name, this.addresses()),
        service ? serviceAnswerFor(query, rinfo, name, service, this.addresses()) : null,
      ];
      for (const answer of answers) {
        if (!answer) continue;
        if (rinfo.port !== MDNS_PORT) mdns.respond(answer, rinfo);
        else mdns.respond(answer);
      }
    });
    mdns.on('error', () => undefined);
    this.announce();
    setTimeout(() => this.announce(), 1000);
    return name;
  }

  /** Re-announces after the addresses changed. */
  announce(): void {
    if (!this.mdns || !this.name) return;
    const answer = answerFor(
      { id: 0, questions: [{ name: this.name, type: ANY }] },
      { address: '', port: MDNS_PORT },
      this.name,
      this.addresses(),
    );
    if (answer) this.mdns.respond(answer);
    // The service too, unasked: a player's Join list fills as soon as the table is up, and
    // follows a new address or campaign name.
    const service = this.service();
    const offered = service
      ? serviceAnswerFor(
          { id: 0, questions: [{ name: TABLE_SERVICE, type: 'PTR' }] },
          { address: '', port: MDNS_PORT },
          this.name,
          service,
          this.addresses(),
        )
      : null;
    if (offered) this.mdns.respond(offered);
  }

  private probe(name: string): Promise<boolean> {
    const mdns = this.mdns!;
    return new Promise((resolve) => {
      let conflict = false;
      const onResponse = (res: Packet) => {
        if (isConflict(res, name, this.addresses())) conflict = true;
      };
      mdns.on('response', onResponse);
      const ask = () => mdns.query({ questions: [{ name, type: ANY }] });
      ask();
      setTimeout(ask, 250);
      setTimeout(ask, 500);
      setTimeout(() => {
        mdns.removeListener('response', onResponse);
        resolve(conflict);
      }, 750);
    });
  }

  /** Sends a goodbye (TTL 0) so caches forget the name at once, then closes the socket. */
  async stop(): Promise<void> {
    const mdns = this.mdns;
    const name = this.name;
    this.mdns = null;
    this.name = null;
    if (!mdns) return;
    if (name) {
      const answers: Answer[] = this.addresses()
        .filter((a) => a.family === 'IPv4')
        .map((a) => ({ type: 'A', name, ttl: 0, data: a.host }));
      // The table leaves players' Join lists at once, not when its records run out.
      answers.push({ type: 'PTR', name: TABLE_SERVICE, ttl: 0, data: serviceInstance(name) });
      await new Promise<void>((done) => mdns.respond({ answers }, () => done()));
    }
    await new Promise<void>((done) => mdns.destroy(() => done()));
  }
}
