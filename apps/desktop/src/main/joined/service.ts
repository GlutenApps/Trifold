import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ClientMessage,
  FoundTableSummary,
  JoinedSummary,
  PlayerLink,
  ServerMessage,
  TablePeekResult,
} from '@trifold/api';
import { JoinedCampaignId, type JoinedCampaign, type Note, type PinnedRoll } from '@trifold/schema';
import { tableUrl } from '@trifold/rules';
import type { LibrarySession } from '../library/session';
import { errorMessage, type Logger } from '../log';
import type { FoundTable } from '../table/mdns';
import { TableDiscovery } from './discovery';
import {
  formatTableAddress,
  LanClient,
  parseTableAddress,
  peekTable,
  type LanSocket,
  type TableEndpoint,
} from './lanClient';
import { JoinedStore } from './store';

/**
 * What the renderer may do about joined campaigns (docs/PLAYER-MODE.md): list them, look for
 * tables on the local network, ask a typed address which campaign it is, join and leave, and
 * open one, which keeps a connection to its GM's table for as long as it is open.
 *
 * The network is used only by the search, `peek` and an open campaign, all started by the
 * player, all on the local network, and not at all while player mode is switched off (CLAUDE.md
 * ground rule 1).
 */
export interface JoinedServiceOptions {
  session: LibrarySession;
  logger: Logger;
  /** Player mode's feature flag. Off, nothing here searches or connects. */
  enabled: boolean;
  /** The list of tables changed while Join a campaign is searching. */
  onTables(tables: FoundTableSummary[]): void;
  /** The open campaign's link changed. */
  onLink?(event: { campaignId: string; link: PlayerLink }): void;
  /** The open campaign's table sent something. */
  onMessage?(event: { campaignId: string; message: ServerMessage }): void;
  /** Where pictures fetched from tables are kept: derived data, outside the Library. */
  cacheDir?: string;
  /** Tests replace the search, the socket and the picture fetch. */
  discovery?: (
    onChange: (tables: FoundTable[]) => void,
  ) => Pick<TableDiscovery, 'start' | 'stop' | 'list'>;
  open?: (url: string, origin: string) => LanSocket;
  fetchPicture?: (url: string) => Promise<{ body: Uint8Array; type: string } | null>;
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

/**
 * The paths a table serves pictures under (`tablePaths` in @trifold/rules), with their version
 * query. Anything else asked of the picture cache is refused before it reaches the network.
 */
const PICTURE_PATH =
  /^\/(map\/[^/?#]+\/[^/?#]+\.jpg|t\/[^/?#]+\/(art|glyph)|c\/(pc|npc|summon)\/[^/?#]+\/portrait|screen\/[^/?#]+\/image)(\?v=[0-9a-z]+)?$/;
const PICTURE_MAX_BYTES = 16 * 1024 * 1024;
const PICTURE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** Failed attempts at one address before the next one is tried. */
const TRIES_PER_ADDRESS = 2;

async function fetchPicture(url: string): Promise<{ body: Uint8Array; type: string } | null> {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!res.ok || !type.startsWith('image/')) return null;
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > PICTURE_MAX_BYTES) return null;
  const body = new Uint8Array(await res.arrayBuffer());
  return body.length > PICTURE_MAX_BYTES ? null : { body, type };
}

/** The one joined campaign that is open, and its connection. */
interface OpenCampaign {
  campaignId: string;
  client: LanClient | null;
  endpoint: TableEndpoint | null;
  link: PlayerLink;
  failures: number;
  /** Addresses that worked before, from `joined.json`. */
  saved: TableEndpoint[];
  token: string | undefined;
}

export class JoinedService {
  private readonly discovery: Pick<TableDiscovery, 'start' | 'stop' | 'list'>;
  /** Join a campaign is listing tables. */
  private searching = false;
  private discovering = false;
  private current: OpenCampaign | null = null;
  /** The campaigns this Library has joined, so a found table can say it is one of them. */
  private joinedIds = new Set<string>();

  constructor(private readonly opts: JoinedServiceOptions) {
    const onChange = () => {
      if (this.searching) this.opts.onTables(this.tables());
      this.tableSeen();
    };
    this.discovery = opts.discovery ? opts.discovery(onChange) : new TableDiscovery(onChange);
  }

  /** Changes to `joined.json` in the order they were asked for, each starting from the last. */
  private writes: Promise<unknown> = Promise.resolve();

  /**
   * Runs one change to a joined campaign's file after the ones before it. A connection that
   * opens saves its address, its claim and the campaign's name within moments of each other;
   * each is a read and a write, and unqueued the last one to land dropped the others.
   */
  private save(what: string, change: (store: JoinedStore) => Promise<unknown>): void {
    const run = this.writes.then(() => change(this.store()));
    this.writes = run.catch((err: unknown) => {
      this.opts.logger.warn(`joined: could not save ${what}: ${errorMessage(err)}`);
    });
  }

  /** Resolves once every save asked for so far has been written (quitting, and tests). */
  async settled(): Promise<void> {
    await this.writes;
  }

  private store(): JoinedStore {
    const store = this.opts.session.store;
    if (!store) throw new Error('No Library is open');
    return new JoinedStore(store);
  }

  /** The search runs while Join a campaign is listing or a campaign is open, and never else. */
  private syncDiscovery(): void {
    const want = this.opts.enabled && (this.searching || this.current !== null);
    if (want === this.discovering) return;
    this.discovering = want;
    if (want) this.discovery.start();
    else this.discovery.stop();
    this.opts.logger.info(
      want ? 'joined: looking for tables on the local network' : 'joined: stopped looking',
    );
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
    this.searching = true;
    this.syncDiscovery();
    return this.tables();
  }

  stopSearch(): void {
    this.searching = false;
    this.syncDiscovery();
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
    if (this.current?.campaignId === campaignId) this.close(campaignId);
    // Saves still waiting finish first, so none of them brings the folder back.
    await this.writes;
    await this.store().leave(campaignId);
    this.joinedIds.delete(campaignId);
    if (this.opts.cacheDir && JoinedCampaignId.safeParse(campaignId).success) {
      await rm(join(this.opts.cacheDir, campaignId), { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    this.opts.logger.info(`joined: left campaign ${campaignId}`);
    if (this.searching) this.opts.onTables(this.tables());
  }

  // ---------- the player's own notes and pinned rolls: files only, no network ----------

  notes(campaignId: string): Promise<Note[]> {
    return this.store().notes(campaignId);
  }

  saveNote(campaignId: string, note: Note): Promise<Note> {
    return this.store().saveNote(campaignId, note);
  }

  removeNote(campaignId: string, id: string): Promise<void> {
    return this.store().removeNote(campaignId, id);
  }

  pinnedRolls(campaignId: string): Promise<PinnedRoll[]> {
    return this.store().pinnedRolls(campaignId);
  }

  savePinnedRoll(campaignId: string, pin: PinnedRoll): Promise<PinnedRoll> {
    return this.store().savePinnedRoll(campaignId, pin);
  }

  removePinnedRoll(campaignId: string, id: string): Promise<void> {
    return this.store().removePinnedRoll(campaignId, id);
  }

  // ---------- an open campaign ----------

  /**
   * Opens a joined campaign: looks for its table and stays connected to it, trying the addresses
   * the search finds and the ones that worked before, until `close`. One campaign at a time.
   */
  async open(campaignId: string): Promise<JoinedSummary | null> {
    const joined = await this.store().get(campaignId);
    if (!joined) return null;
    if (this.current?.campaignId === campaignId) return summarize(joined);
    if (this.current) this.close(this.current.campaignId);
    this.current = {
      campaignId,
      client: null,
      endpoint: null,
      link: 'connecting',
      failures: 0,
      saved: joined.addresses.flatMap((a) => parseTableAddress(a) ?? []),
      token: joined.deviceToken,
    };
    if (!this.opts.enabled) return summarize(joined);
    void this.trimPictures(campaignId);
    this.syncDiscovery();
    this.connectNext();
    this.opts.logger.info(`joined: opened campaign ${campaignId}`);
    return summarize(joined);
  }

  /** Closes the open campaign's connection. */
  close(campaignId: string): void {
    const current = this.current;
    if (!current || current.campaignId !== campaignId) return;
    this.current = null;
    current.client?.stop();
    this.syncDiscovery();
    this.opts.logger.info(`joined: closed campaign ${campaignId}`);
  }

  /** A request from the player console to the open campaign's table. */
  send(campaignId: string, message: ClientMessage): void {
    if (this.current?.campaignId === campaignId) this.current.client?.send(message);
  }

  /** Where the open campaign's table may be: what the search found first, then what worked. */
  private candidates(current: OpenCampaign): TableEndpoint[] {
    const found = this.discovery
      .list()
      .filter((t) => t.campaignId === current.campaignId)
      .flatMap((t) => t.addresses.map((host) => ({ host, port: t.port })));
    const all = [...found, ...current.saved];
    const seen = new Set<string>();
    return all.filter((e) => {
      const key = formatTableAddress(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Connects to the next place the table may be; with nowhere to try, the search goes on. */
  private connectNext(): void {
    const current = this.current;
    if (!current) return;
    const options = this.candidates(current);
    const at = current.endpoint
      ? options.findIndex((e) => formatTableAddress(e) === formatTableAddress(current.endpoint!))
      : -1;
    const next = options[(at + 1) % Math.max(1, options.length)];
    if (!next) {
      this.setLink(current, 'reconnecting');
      return;
    }
    this.connectTo(current, next);
  }

  private connectTo(current: OpenCampaign, endpoint: TableEndpoint): void {
    current.client?.stop();
    current.endpoint = endpoint;
    current.failures = 0;
    const address = formatTableAddress(endpoint);
    const client = new LanClient({
      endpoint,
      campaignId: current.campaignId,
      ...(current.token ? { token: current.token } : {}),
      ...(this.opts.open ? { open: this.opts.open } : {}),
      onLink: (link) => {
        if (this.current !== current || current.client !== client) return;
        this.setLink(current, link);
        if (link === 'open') {
          current.failures = 0;
          this.save('the address', (store) => store.connected(current.campaignId, address));
        } else if (link === 'reconnecting') {
          current.failures += 1;
          // This address is not answering: the table may have moved.
          if (current.failures >= TRIES_PER_ADDRESS && this.candidates(current).length > 1) {
            this.connectNext();
          }
        }
      },
      onMessage: (message) => {
        if (this.current !== current || current.client !== client) return;
        // The token is the claim and stays in main; the console is told only that there is one.
        if (message.type === 'token') return;
        this.opts.onMessage?.({ campaignId: current.campaignId, message });
      },
      onToken: (token) => {
        current.token = token;
        this.save('the claim', (store) => store.update(current.campaignId, { deviceToken: token }));
      },
      onCampaign: (campaignName) => {
        this.save('the campaign’s name', (store) =>
          store.update(current.campaignId, { campaignName: campaignName.trim().slice(0, 200) }),
        );
      },
    });
    current.client = client;
    this.setLink(current, 'connecting');
    client.start();
  }

  private setLink(current: OpenCampaign, link: PlayerLink): void {
    current.link = link;
    this.opts.onLink?.({ campaignId: current.campaignId, link });
  }

  /**
   * The search heard something: an open campaign that is not connected goes where its table was
   * just found. Only a table found for this campaign moves it; hearing about other tables, or
   * about none, leaves the attempt in hand alone.
   */
  private tableSeen(): void {
    const current = this.current;
    if (!current || current.link === 'open') return;
    const table = this.discovery.list().find((t) => t.campaignId === current.campaignId);
    const host = table?.addresses[0];
    if (!table || !host) return;
    const found = { host, port: table.port };
    const sameAsNow =
      current.endpoint && formatTableAddress(current.endpoint) === formatTableAddress(found);
    if (!current.client || !sameAsNow) this.connectTo(current, found);
  }

  // ---------- pictures ----------

  private pictureFile(campaignId: string, path: string): string | null {
    if (!this.opts.cacheDir || !JoinedCampaignId.safeParse(campaignId).success) return null;
    const name = createHash('sha256').update(path, 'utf8').digest('hex');
    return join(this.opts.cacheDir, campaignId, name);
  }

  /**
   * A picture from a joined campaign's table, by the path its view names (PLAYER-MODE.md,
   * "Pictures"): from the cache, else fetched from the table while the campaign is open and
   * connected, and kept. A changed picture has a new path, so a cached one is never stale. The
   * renderer never reaches the network for these itself.
   */
  async picture(
    campaignId: string,
    path: string,
  ): Promise<{ body: Uint8Array; type: string } | null> {
    if (!PICTURE_PATH.test(path)) return null;
    const file = this.pictureFile(campaignId, path);
    if (file) {
      try {
        const [body, type] = await Promise.all([readFile(file), readFile(`${file}.type`, 'utf8')]);
        if (type.startsWith('image/')) return { body, type };
      } catch {
        // Not cached yet.
      }
    }
    const current = this.current;
    if (!this.opts.enabled || current?.campaignId !== campaignId) return null;
    if (current.link !== 'open' || !current.endpoint) return null;
    const url = tableUrl(current.endpoint.host, current.endpoint.port) + path;
    let got: { body: Uint8Array; type: string } | null;
    try {
      got = await (this.opts.fetchPicture ?? fetchPicture)(url);
    } catch (err) {
      this.opts.logger.warn(`joined: a picture did not load: ${errorMessage(err)}`);
      return null;
    }
    if (got && file) {
      try {
        await mkdir(join(file, '..'), { recursive: true });
        await writeFile(file, got.body);
        await writeFile(`${file}.type`, got.type, 'utf8');
      } catch (err) {
        this.opts.logger.warn(`joined: could not cache a picture: ${errorMessage(err)}`);
      }
    }
    return got;
  }

  /** Old pictures go: a map's image changes its path with the fog, so they pile up. */
  private async trimPictures(campaignId: string): Promise<void> {
    if (!this.opts.cacheDir || !JoinedCampaignId.safeParse(campaignId).success) return;
    const dir = join(this.opts.cacheDir, campaignId);
    const now = Date.now();
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const info = await stat(join(dir, name)).catch(() => null);
      if (info && now - info.mtimeMs > PICTURE_KEEP_MS) {
        await rm(join(dir, name), { force: true }).catch(() => undefined);
      }
    }
  }

  /** The app is quitting or the Library is changing: nothing keeps looking or stays connected. */
  stop(): void {
    if (this.current) this.close(this.current.campaignId);
    this.searching = false;
    this.syncDiscovery();
    this.joinedIds.clear();
  }
}
