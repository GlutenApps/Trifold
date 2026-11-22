import type { FoundTableSummary, JoinedSummary, TablePeekResult } from '@trifold/api';
import type { JoinedCampaign } from '@trifold/schema';
import type { LibrarySession } from '../library/session';
import type { Logger } from '../log';
import type { FoundTable } from '../table/mdns';
import { TableDiscovery } from './discovery';
import { formatTableAddress, parseTableAddress, peekTable, type LanSocket } from './lanClient';
import { JoinedStore } from './store';

/**
 * What the renderer may do about joined campaigns (docs/PLAYER-MODE.md, "Joined campaigns"):
 * list them, look for tables on the local network, ask a typed address which campaign it is,
 * join and leave. The network is used only by `startSearch` and `peek`, both started by the
 * player from Join a campaign, and not at all while player mode is switched off.
 */
export interface JoinedServiceOptions {
  session: LibrarySession;
  logger: Logger;
  /** Player mode's feature flag. Off, nothing here searches or connects. */
  enabled: boolean;
  /** The list of tables changed while the search runs. */
  onTables(tables: FoundTableSummary[]): void;
  /** Tests replace the search and the socket. */
  discovery?: (
    onChange: (tables: FoundTable[]) => void,
  ) => Pick<TableDiscovery, 'start' | 'stop' | 'list'>;
  open?: (url: string, origin: string) => LanSocket;
}

/** What the renderer sees of a joined campaign: never the device token, only that there is one. */
export function summarize(joined: JoinedCampaign): JoinedSummary {
  return {
    campaignId: joined.campaignId,
    campaignName: joined.campaignName,
    displayName: joined.displayName,
    characterId: joined.characterId,
    joinedAt: joined.joinedAt,
    lastLiveAt: joined.lastLiveAt,
    claimed: !!joined.deviceToken,
  };
}

export class JoinedService {
  private readonly discovery: Pick<TableDiscovery, 'start' | 'stop' | 'list'>;
  private searching = false;
  /** The campaigns this Library has joined, so a found table can say it is one of them. */
  private joinedIds = new Set<string>();

  constructor(private readonly opts: JoinedServiceOptions) {
    const onChange = () => this.opts.onTables(this.tables());
    this.discovery = opts.discovery ? opts.discovery(onChange) : new TableDiscovery(onChange);
  }

  private store(): JoinedStore {
    const store = this.opts.session.store;
    if (!store) throw new Error('No Library is open');
    return new JoinedStore(store);
  }

  async list(): Promise<JoinedSummary[]> {
    const all = await this.store().list();
    this.joinedIds = new Set(all.map((j) => j.campaignId));
    return all.map(summarize);
  }

  /** One row per campaign found, at the first address it gave. */
  private tables(): FoundTableSummary[] {
    if (!this.searching) return [];
    const seen = new Set<string>();
    const out: FoundTableSummary[] = [];
    for (const table of this.discovery.list()) {
      const host = table.addresses[0];
      if (!host || seen.has(table.campaignId)) continue;
      seen.add(table.campaignId);
      out.push({
        campaignId: table.campaignId,
        campaignName: table.campaignName,
        address: formatTableAddress({ host, port: table.port }),
        joined: this.joinedIds.has(table.campaignId),
      });
    }
    return out;
  }

  /** Starts looking for tables on the local network; `onTables` follows the list. */
  async startSearch(): Promise<FoundTableSummary[]> {
    if (!this.opts.enabled) return [];
    await this.list().catch(() => undefined);
    if (!this.searching) {
      this.searching = true;
      this.discovery.start();
      this.opts.logger.info('joined: looking for tables on the local network');
    }
    return this.tables();
  }

  stopSearch(): void {
    if (!this.searching) return;
    this.searching = false;
    this.discovery.stop();
    this.opts.logger.info('joined: stopped looking for tables');
  }

  /** Asks the table at a typed address which campaign it is. Nothing is sent to it. */
  async peek(address: string): Promise<TablePeekResult> {
    const endpoint = parseTableAddress(address);
    if (!endpoint) return { ok: false, reason: 'address' };
    if (!this.opts.enabled) return { ok: false, reason: 'noAnswer' };
    const answer = await peekTable(endpoint, this.opts.open);
    if (!answer) return { ok: false, reason: 'noAnswer' };
    await this.list().catch(() => undefined);
    return {
      ok: true,
      table: {
        campaignId: answer.campaignId,
        campaignName: answer.campaignName,
        address: formatTableAddress(endpoint),
        joined: this.joinedIds.has(answer.campaignId),
      },
    };
  }

  async join(input: {
    campaignId: string;
    campaignName: string;
    displayName: string;
    address: string;
  }): Promise<JoinedSummary> {
    const endpoint = parseTableAddress(input.address);
    if (!endpoint) throw new Error('That is not an address on the local network.');
    const joined = await this.store().join({
      campaignId: input.campaignId,
      campaignName: input.campaignName.trim().slice(0, 200),
      displayName: input.displayName,
      address: formatTableAddress(endpoint),
    });
    this.joinedIds.add(joined.campaignId);
    // The id is the GM's; the name is free text from the network, so it stays out of the log.
    this.opts.logger.info(`joined: joined campaign ${joined.campaignId}`);
    if (this.searching) this.opts.onTables(this.tables());
    return summarize(joined);
  }

  async leave(campaignId: string): Promise<void> {
    await this.store().leave(campaignId);
    this.joinedIds.delete(campaignId);
    this.opts.logger.info(`joined: left campaign ${campaignId}`);
    if (this.searching) this.opts.onTables(this.tables());
  }

  /** The app is quitting or the Library is changing: nothing keeps looking. */
  stop(): void {
    this.stopSearch();
    this.joinedIds.clear();
  }
}
