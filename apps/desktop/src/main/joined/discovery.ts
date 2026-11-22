import makeMdns from 'multicast-dns';
import type { Packet } from 'dns-packet';
import { parseTableServices, TABLE_SERVICE, type FoundTable } from '../table/mdns';

/**
 * Finding tables on the local network (docs/PLAYER-MODE.md, "Table discovery"): a player's
 * Trifold asks mDNS for the table service a GM's Trifold advertises while its table server runs
 * (`table/mdns.ts`), and keeps a list of the ones that answer.
 *
 * It is a network use the player starts (CLAUDE.md ground rule 1): nothing here runs until
 * `start()`, which the app calls only while Join a campaign or a joined campaign is open, and it
 * is multicast on the local network, nothing else. A network that blocks multicast finds
 * nothing; typing the address still works.
 */

/** When the search asks: at once, twice more quickly, then every ten seconds while it runs. */
export const QUERY_DELAYS_MS = [0, 1000, 3000] as const;
export const REQUERY_MS = 10_000;
/** A table not heard from for this long is dropped (its records live 120 s; three missed asks). */
export const STALE_MS = 35_000;

/**
 * The list of tables as answers come in. Pure, so the timing rules are tested without a network:
 * a table is kept by its instance, refreshed by every answer, dropped by a goodbye or after
 * `STALE_MS` of silence.
 */
export class FoundTables {
  private readonly seen = new Map<string, { table: FoundTable; at: number }>();

  /** Takes one response. Returns whether the list changed. */
  take(packet: Pick<Packet, 'answers' | 'additionals'>, now: number): boolean {
    const { found, gone } = parseTableServices(packet);
    let changed = false;
    for (const instance of gone) changed = this.seen.delete(instance.toLowerCase()) || changed;
    for (const table of found) {
      const key = table.instance.toLowerCase();
      const before = this.seen.get(key);
      if (!before || JSON.stringify(before.table) !== JSON.stringify(table)) changed = true;
      this.seen.set(key, { table, at: now });
    }
    return changed;
  }

  /** Drops tables that have gone quiet. Returns whether the list changed. */
  sweep(now: number): boolean {
    let changed = false;
    for (const [key, entry] of this.seen) {
      if (now - entry.at > STALE_MS) changed = this.seen.delete(key) || changed;
    }
    return changed;
  }

  /** The tables, by campaign name then instance, so the list does not jump about. */
  list(): FoundTable[] {
    return [...this.seen.values()]
      .map((e) => e.table)
      .sort(
        (a, b) =>
          a.campaignName.localeCompare(b.campaignName) || a.instance.localeCompare(b.instance),
      );
  }

  clear(): void {
    this.seen.clear();
  }
}

/** The part of multicast-dns the search uses; tests hand in their own. */
export interface MdnsSocket {
  on(event: 'response', listener: (packet: Packet) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  query(query: { questions: Array<{ name: string; type: 'PTR' }> }): void;
  destroy(done?: () => void): void;
}

export class TableDiscovery {
  private socket: MdnsSocket | null = null;
  private timers: NodeJS.Timeout[] = [];
  private readonly tables = new FoundTables();

  constructor(
    private readonly onChange: (tables: FoundTable[]) => void,
    private readonly open: () => MdnsSocket = () =>
      makeMdns({ reuseAddr: true, loopback: true }) as unknown as MdnsSocket,
    private readonly now: () => number = Date.now,
  ) {}

  get running(): boolean {
    return this.socket !== null;
  }

  /** Starts asking, if it is not already. The list starts empty and `onChange` follows it. */
  start(): void {
    if (this.socket) return;
    const socket = this.open();
    this.socket = socket;
    socket.on('response', (packet) => {
      if (this.tables.take(packet, this.now())) this.onChange(this.tables.list());
    });
    // A network with no multicast is not an error to show: the list just stays empty.
    socket.on('error', () => undefined);
    const ask = () => socket.query({ questions: [{ name: TABLE_SERVICE, type: 'PTR' }] });
    for (const delay of QUERY_DELAYS_MS) this.timers.push(setTimeout(ask, delay));
    this.timers.push(
      setInterval(() => {
        ask();
        if (this.tables.sweep(this.now())) this.onChange(this.tables.list());
      }, REQUERY_MS),
    );
  }

  /** Stops asking and closes the socket. The list is forgotten. */
  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const socket = this.socket;
    this.socket = null;
    this.tables.clear();
    socket?.destroy();
  }

  list(): FoundTable[] {
    return this.tables.list();
  }
}
