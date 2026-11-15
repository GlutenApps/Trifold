import makeMdns from 'multicast-dns';
import type { Answer, Packet, Question } from 'dns-packet';

/** dns-packet's types leave out ANY (255), which it encodes fine. */
const ANY = 'ANY' as unknown as Question['type'];

export interface MdnsResponse {
  type: 'response';
  id: number;
  flags: number;
  questions?: Question[];
  answers: Answer[];
}
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

export class MdnsResponder {
  private mdns: ReturnType<typeof makeMdns> | null = null;
  private name: string | null = null;

  constructor(private readonly addresses: () => readonly LanAddress[]) {}

  /**
   * Probes for a free name (RFC 6762 §8.1: three queries 250 ms apart; any answer for another
   * address is a conflict), then announces it and answers for it. Resolves to the name won.
   */
  async start(): Promise<string> {
    const mdns = makeMdns({ reuseAddr: true, loopback: false });
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
      const answer = answerFor(query, rinfo, name, this.addresses());
      if (!answer) return;
      if (rinfo.port !== MDNS_PORT) mdns.respond(answer, rinfo);
      else mdns.respond(answer);
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
      await new Promise<void>((done) => mdns.respond({ answers }, () => done()));
    }
    await new Promise<void>((done) => mdns.destroy(() => done()));
  }
}
