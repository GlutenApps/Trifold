import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ClientMessage,
  SheetOffer,
  ChangeAddressResult,
  FoundTableSummary,
  OpenPackResult,
  PlayerPackInfo,
  JoinedSummary,
  LastTableView,
  PlayerLink,
  ServerMessage,
  TablePeekResult,
} from '@trifold/api';
import {
  JoinedCampaignId,
  type JoinedCampaign,
  type Note,
  type PinnedRoll,
  type PlayerSheet,
} from '@trifold/schema';
import { fitSheetShare, tableUrl, whoMustUpdate } from '@trifold/rules';
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
import { cleanShared, JoinedStore, sharedSourceId } from './store';
import { readPlayerPack, type PlayerPackManifest } from '../table/playerPack';

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
  /** Off (in tests), nothing here searches or connects. */
  enabled: boolean;
  /** The list of tables changed while Join a campaign is searching. */
  onTables(tables: FoundTableSummary[]): void;
  /** The open campaign's link changed. */
  onLink?(event: { campaignId: string; link: PlayerLink; tableVersion?: string }): void;
  /** The open campaign's table sent something. */
  onMessage?(event: { campaignId: string; message: ServerMessage }): void;
  /** Where pictures fetched from tables are kept: derived data, outside the Library. */
  cacheDir?: string;
  /**
   * A joined campaign's shared content changed on disk (synced, unshared, or the campaign was
   * left), or the campaign was opened: the index is brought in line, and the console is told
   * how many records the campaign holds.
   */
  onShared?(campaignId: string, records: number): void | Promise<void>;
  /**
   * The table numbers of one of the Library's characters (ADR 0071), offered to the GM for the
   * PC the player holds; null when the character is gone.
   */
  characterOffer?(characterId: string): Promise<SheetOffer | null>;
  /**
   * One of the Library's characters as its sheet shows it (ADR 0078), shared with the GM to read
   * on the PC card the player holds; null when the character is gone.
   */
  characterSheet?(characterId: string): Promise<PlayerSheet | null>;
  /** How long after a change the sheet is shared; tests shorten it. */
  shareDelayMs?: number;
  /** Tests replace the search, the socket and the fetches. */
  discovery?: (
    onChange: (tables: FoundTable[]) => void,
  ) => Pick<TableDiscovery, 'start' | 'stop' | 'list'>;
  open?: (url: string, origin: string) => LanSocket;
  fetchPicture?: (url: string) => Promise<{ body: Uint8Array; type: string } | null>;
  fetchShared?: (
    url: string,
    token: string,
  ) => Promise<{ hash: string; records: unknown[] } | null>;
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
    openedAt: joined.openedAt,
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
/** The newest view is written to the cache this long after it arrived, not once per message. */
const VIEW_SAVE_MS = 2000;
const VIEW_FILE = 'last-view.json';
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

/** Shared content larger than this is not fetched. */
const SHARED_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Asks a table for what its campaign shares (ADR 0060). The device token goes in a header: it
 * is what proves this is a device the table knows.
 */
async function fetchShared(
  url: string,
  token: string,
): Promise<{ hash: string; records: unknown[] } | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok || Number(res.headers.get('content-length') ?? 0) > SHARED_MAX_BYTES) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > SHARED_MAX_BYTES) return null;
  const body = JSON.parse(new TextDecoder().decode(bytes)) as {
    hash?: unknown;
    records?: unknown;
  } | null;
  if (!body || typeof body.hash !== 'string' || !Array.isArray(body.records)) return null;
  return { hash: body.hash, records: body.records as unknown[] };
}

/**
 * A pack is older than what a Library holds when the content differs and the Library's was made
 * later: the table's sync, or a newer pack.
 */
export function packIsOlder(
  held: { hash: string; at: string } | null,
  pack: Pick<PlayerPackManifest, 'hash' | 'createdAt'>,
): boolean {
  if (!held || held.hash === pack.hash) return false;
  return Date.parse(held.at) > Date.parse(pack.createdAt);
}

/** The one joined campaign that is open, and its connection. */
interface OpenCampaign {
  campaignId: string;
  client: LanClient | null;
  endpoint: TableEndpoint | null;
  link: PlayerLink;
  /** The table's app version, as it last said (ADR 0076). */
  tableVersion?: string;
  failures: number;
  /** Addresses that worked before, from `joined.json`. */
  saved: TableEndpoint[];
  token: string | undefined;
  /** The character linked here, and the last sheet update the GM answered (ADR 0071). */
  characterId: string | null;
  sheetAnswered: string | null;
  /** The PC this connection holds, and the update sent for it and not answered yet. */
  offerPc: string | null;
  offered: string | null;
  /** The last sheet shared on this connection (ADR 0078), and the share waiting to go. */
  shared: string | null;
  shareTimer: ReturnType<typeof setTimeout> | null;
}

/** A sheet is shared this long after its last change, so one being edited goes once. */
const SHARE_DELAY_MS = 1500;

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
    this.flushView();
    await Promise.all([this.writes, this.viewWrites, this.sharedSync]);
  }

  // ---------- shared content (ADR 0060) ----------

  private sharedSync: Promise<void> = Promise.resolve();

  /**
   * The player's own sources changed (an import, a re-parse, a book turned on or off): which
   * shared records step aside for their own copies may have too, so the console hears again.
   */
  async ownSourcesChanged(): Promise<void> {
    const current = this.current;
    if (!current) return;
    const count = await this.store().sharedCount(current.campaignId);
    await this.opts.onShared?.(current.campaignId, count);
  }

  /** The open joined campaign's shared source, which the compendium shows while it is open. */
  openSharedSourceId(): string | null {
    return this.current ? sharedSourceId(this.current.campaignId) : null;
  }

  /**
   * The table said what its campaign shares now. When this Library holds something else, it
   * fetches the whole set and replaces its copy; an empty hash means nothing is shared, and the
   * copy goes. What arrives is checked record by record before it is kept.
   */
  private syncShared(current: OpenCampaign, hash: string): void {
    const { campaignId } = current;
    this.sharedSync = this.sharedSync
      .then(async () => {
        const store = this.store();
        if ((await store.sharedHash(campaignId)) === hash) return;
        let count = 0;
        if (!hash) {
          await store.removeShared(campaignId);
        } else {
          if (this.current !== current || !current.endpoint || !current.token) return;
          const url = `${tableUrl(current.endpoint.host, current.endpoint.port)}/shared`;
          const got = await (this.opts.fetchShared ?? fetchShared)(url, current.token);
          if (!got) return;
          const records = cleanShared(campaignId, got.records);
          await store.writeShared(campaignId, { hash: got.hash, records });
          count = records.length;
          this.opts.logger.info(`joined: shared content updated, ${records.length} records`);
        }
        await this.opts.onShared?.(campaignId, count);
      })
      .catch((err: unknown) => {
        this.opts.logger.warn(`joined: shared content did not sync: ${errorMessage(err)}`);
      });
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
        ...(table.appVersion ? { appVersion: table.appVersion } : {}),
        // A search hears the table's protocol before anything connects (ADR 0076).
        ...(whoMustUpdate(table.protocol) ? { update: whoMustUpdate(table.protocol)! } : {}),
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
        ...(answer.appVersion ? { appVersion: answer.appVersion } : {}),
        ...(answer.update ? { update: answer.update } : {}),
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

  /** A character of the Library changed (ADR 0071): if it is the one linked, offer its numbers. */
  characterChanged(characterId: string): void {
    const current = this.current;
    if (current && current.characterId === characterId) {
      void this.offerSheet(current);
      this.queueShare(current);
    }
  }

  /**
   * Shares the linked character's sheet for the PC held (ADR 0078), a moment after the last
   * change; when the player unlinks it, takes it back.
   */
  private queueShare(current: OpenCampaign): void {
    if (current.shareTimer) clearTimeout(current.shareTimer);
    current.shareTimer = setTimeout(() => {
      current.shareTimer = null;
      void this.shareSheet(current);
    }, this.opts.shareDelayMs ?? SHARE_DELAY_MS);
  }

  private async shareSheet(current: OpenCampaign): Promise<void> {
    const pcId = current.offerPc;
    const characterId = current.characterId;
    if (this.current !== current || current.link !== 'open' || !pcId) return;
    if (!this.opts.characterSheet) return;
    const whole = characterId
      ? await this.opts.characterSheet(characterId).catch(() => null)
      : null;
    if (this.current !== current || current.offerPc !== pcId) return;
    if (current.characterId !== characterId) return;
    const character = whole ? fitSheetShare(whole) : null;
    if (whole && !character) {
      this.opts.logger.warn(`joined: the sheet for pc ${pcId} is too large to share`);
      return;
    }
    // Nothing shared on this connection and nothing to share: nothing to take back either.
    if (!character && current.shared === null) return;
    const key = JSON.stringify({ pcId, character });
    if (key === current.shared) return;
    current.shared = key;
    current.client?.send({ type: 'sheetShare', creatureId: pcId, character });
    this.opts.logger.info(`joined: ${character ? 'shared' : 'took back'} the sheet for pc ${pcId}`);
  }

  /**
   * Offers the linked character's table numbers for the PC held at the table (PLAYER-MODE.md,
   * Sheet updates): only connected, holding a PC, and when they differ from what the GM last
   * answered and from what is waiting for an answer.
   */
  private async offerSheet(current: OpenCampaign): Promise<void> {
    const pcId = current.offerPc;
    const characterId = current.characterId;
    if (current.link !== 'open' || !pcId || !characterId || !this.opts.characterOffer) return;
    const offer = await this.opts.characterOffer(characterId).catch(() => null);
    if (!offer || this.current !== current || current.offerPc !== pcId) return;
    const key = JSON.stringify({ pcId, offer });
    if (key === current.sheetAnswered || key === current.offered) return;
    current.offered = key;
    current.client?.send({ type: 'sheetOffer', creatureId: pcId, offer });
    this.opts.logger.info(`joined: offered sheet numbers for pc ${pcId}`);
  }

  /** Links a character of the Library to a joined campaign (ADR 0068), or unlinks with null. */
  async linkCharacter(campaignId: string, characterId: string | null): Promise<JoinedSummary> {
    // In the same queue as the connection's saves to the file, so neither undoes the other.
    const run = this.writes.then(() => this.store().update(campaignId, { characterId }));
    this.writes = run.catch(() => undefined);
    const next = await run;
    if (!next) throw new Error('This campaign is not joined.');
    const current = this.current;
    if (current?.campaignId === campaignId) {
      current.characterId = characterId;
      current.offered = null;
      void this.offerSheet(current);
      this.queueShare(current);
    }
    return summarize(next);
  }

  async leave(campaignId: string): Promise<void> {
    if (this.current?.campaignId === campaignId) this.close(campaignId);
    // Saves still waiting finish first, so none of them brings the folder back.
    await Promise.all([this.writes, this.viewWrites, this.sharedSync]);
    await this.store().leave(campaignId);
    this.joinedIds.delete(campaignId);
    // Its shared content went with the folder: the index lets go of it too.
    await this.opts.onShared?.(campaignId, 0);
    if (this.opts.cacheDir && JoinedCampaignId.safeParse(campaignId).success) {
      await rm(join(this.opts.cacheDir, campaignId), { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    this.opts.logger.info(`joined: left campaign ${campaignId}`);
    if (this.searching) this.opts.onTables(this.tables());
  }

  // ---------- player packs (ADR 0064): files only, no network ----------

  /** A pack read but not opened: what the Join panel shows before the player says yes. */
  async inspectPack(path: string): Promise<PlayerPackInfo> {
    const { manifest } = await readPlayerPack(path);
    const store = this.store();
    const held = await store.sharedInfo(manifest.campaignId);
    return {
      path,
      campaignId: manifest.campaignId,
      campaignName: manifest.campaignName,
      records: manifest.records,
      createdAt: manifest.createdAt,
      sourcesNotIncluded: manifest.sourcesNotIncluded,
      joined: !!(await store.get(manifest.campaignId)),
      older: packIsOlder(held, manifest),
    };
  }

  /**
   * Opens a pack: joins its campaign if this Library has not, and keeps its shared content as
   * the campaign's read-only source, every record checked first. A pack older than what this
   * Library holds is refused, so a stale file never undoes what the table sent.
   */
  async openPack(path: string, displayName: string): Promise<OpenPackResult> {
    let pack: Awaited<ReturnType<typeof readPlayerPack>>;
    try {
      pack = await readPlayerPack(path);
    } catch (err) {
      return { ok: false, reason: 'unreadable', message: errorMessage(err) };
    }
    const { manifest } = pack;
    const store = this.store();
    if (packIsOlder(await store.sharedInfo(manifest.campaignId), manifest)) {
      return {
        ok: false,
        reason: 'older',
        message: 'You already have newer content from your GM for this campaign.',
      };
    }
    await this.writes;
    const existing = await store.get(manifest.campaignId);
    const joined =
      existing ??
      (await store.join({
        campaignId: manifest.campaignId,
        campaignName: manifest.campaignName.trim().slice(0, 200),
        displayName,
      }));
    this.joinedIds.add(joined.campaignId);
    const records = cleanShared(manifest.campaignId, pack.records);
    await store.writeShared(
      manifest.campaignId,
      { hash: manifest.hash, records },
      manifest.createdAt,
    );
    await this.opts.onShared?.(manifest.campaignId, records.length);
    this.opts.logger.info(
      `joined: opened a player pack for campaign ${manifest.campaignId}, ${records.length} records`,
    );
    return { ok: true, campaign: summarize(joined), records: records.length };
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
    // The lists put recently opened campaigns first. Queued with the file's other changes.
    this.save('when it was opened', (store) => store.opened(campaignId));
    this.current = {
      campaignId,
      client: null,
      endpoint: null,
      link: 'connecting',
      failures: 0,
      saved: joined.addresses.flatMap((a) => parseTableAddress(a) ?? []),
      token: joined.deviceToken,
      characterId: joined.characterId,
      sheetAnswered: joined.sheetAnswered,
      offerPc: null,
      offered: null,
      shared: null,
      shareTimer: null,
    };
    // What the campaign's GM shared last time is here before the table is found.
    this.sharedSync = this.sharedSync
      .then(async () =>
        this.opts.onShared?.(campaignId, await this.store().sharedCount(campaignId)),
      )
      .catch(() => undefined);
    if (!this.opts.enabled) return summarize(joined);
    void this.trimPictures(campaignId);
    this.syncDiscovery();
    this.connectNext();
    this.opts.logger.info(`joined: opened campaign ${campaignId}`);
    return summarize(joined);
  }

  /**
   * Change address (PLAYER-MODE.md, "What the player sees when it fails"): the player typed
   * where their GM's table is, because their network blocks the search. The address is asked
   * which campaign it is, and nothing more is sent to it unless it is this one; then it is kept
   * in `joined.json` and the open campaign connects there.
   */
  async changeAddress(campaignId: string, address: string): Promise<ChangeAddressResult> {
    const endpoint = parseTableAddress(address);
    if (!endpoint) return { ok: false, reason: 'address' };
    if (!this.opts.enabled || !(await this.store().get(campaignId))) {
      return { ok: false, reason: 'noAnswer' };
    }
    const answer = await peekTable(endpoint, this.opts.open);
    if (!answer) return { ok: false, reason: 'noAnswer' };
    if (answer.campaignId !== campaignId) return { ok: false, reason: 'otherCampaign' };
    const text = formatTableAddress(endpoint);
    this.save('the address', (store) => store.addAddress(campaignId, text));
    const current = this.current;
    if (current?.campaignId === campaignId) {
      current.saved = [endpoint, ...current.saved.filter((e) => formatTableAddress(e) !== text)];
      if (current.link !== 'open') this.connectTo(current, endpoint);
    }
    this.opts.logger.info(`joined: address changed for campaign ${campaignId}`);
    return { ok: true };
  }

  /** Closes the open campaign's connection. */
  close(campaignId: string): void {
    const current = this.current;
    if (!current || current.campaignId !== campaignId) return;
    this.current = null;
    if (current.shareTimer) clearTimeout(current.shareTimer);
    current.client?.stop();
    this.flushView();
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
        // What the campaign shares is main's to fetch and file; the console only reads it.
        if (message.type === 'shared') return this.syncShared(current, message.hash);
        if (message.type === 'state') {
          this.rememberView(current.campaignId, message);
          // The PC held here: a new one (or the first) is offered the linked sheet's numbers.
          const pc = message.mine.find((c) => c.kind === 'pc')?.id ?? null;
          if (pc !== current.offerPc) {
            current.offerPc = pc;
            current.offered = null;
            current.shared = null;
            void this.offerSheet(current);
            this.queueShare(current);
          }
        }
        if (message.type === 'sheetAnswer' && current.offered) {
          // Accepted or dismissed, the same numbers are not offered again.
          const answered = current.offered;
          current.sheetAnswered = answered;
          current.offered = null;
          this.save('the sheet answer', (store) =>
            store.update(current.campaignId, { sheetAnswered: answered }),
          );
        }
        this.opts.onMessage?.({ campaignId: current.campaignId, message });
      },
      onToken: (token) => {
        current.token = token;
        this.save('the claim', (store) => store.update(current.campaignId, { deviceToken: token }));
      },
      onCampaign: (campaignName, appVersion) => {
        current.tableVersion = appVersion;
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
    // An update not answered before the link dropped is offered again at the next connection.
    if (link !== 'open') {
      current.offerPc = null;
      current.offered = null;
      current.shared = null;
      if (current.shareTimer) clearTimeout(current.shareTimer);
      current.shareTimer = null;
    }
    this.opts.onLink?.({
      campaignId: current.campaignId,
      link,
      ...(current.tableVersion ? { tableVersion: current.tableVersion } : {}),
    });
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

  // ---------- the last view, for the offline view ----------

  /** The newest view not yet written to the cache. */
  private pendingView: (LastTableView & { campaignId: string }) | null = null;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  private viewWrites: Promise<unknown> = Promise.resolve();

  private viewFile(campaignId: string): string | null {
    if (!this.opts.cacheDir || !JoinedCampaignId.safeParse(campaignId).success) return null;
    return join(this.opts.cacheDir, campaignId, VIEW_FILE);
  }

  /**
   * Keeps what the table last showed this player (PLAYER-MODE.md, "Not live"), beside its
   * pictures in the cache: derived data, outside the Library. It is the player's own view, as
   * the table filtered it for them, and nothing more.
   */
  private rememberView(campaignId: string, message: ServerMessage & { type: 'state' }): void {
    if (!this.viewFile(campaignId)) return;
    const { type: _type, ...view } = message;
    this.pendingView = { campaignId, view, at: new Date().toISOString() };
    if (!this.viewTimer) {
      this.viewTimer = setTimeout(() => this.flushView(), VIEW_SAVE_MS);
      this.viewTimer.unref?.();
    }
  }

  private flushView(): void {
    if (this.viewTimer) clearTimeout(this.viewTimer);
    this.viewTimer = null;
    const pending = this.pendingView;
    this.pendingView = null;
    const file = pending && this.viewFile(pending.campaignId);
    if (!pending || !file) return;
    const { campaignId: _campaignId, ...last } = pending;
    this.viewWrites = this.viewWrites
      .then(async () => {
        await mkdir(join(file, '..'), { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(last), 'utf8');
        await rename(`${file}.tmp`, file);
      })
      .catch((err: unknown) => {
        this.opts.logger.warn(`joined: could not keep the last view: ${errorMessage(err)}`);
      });
  }

  /** What a joined campaign's table last showed this player, and when; null when never seen. */
  async lastView(campaignId: string): Promise<LastTableView | null> {
    if (this.pendingView?.campaignId === campaignId) {
      return { view: this.pendingView.view, at: this.pendingView.at };
    }
    const file = this.viewFile(campaignId);
    if (!file) return null;
    await this.viewWrites;
    try {
      const last = JSON.parse(await readFile(file, 'utf8')) as Partial<LastTableView> | null;
      const view = last?.view;
      // The file is this app's own, but a cache can be damaged: anything not a view is nothing.
      if (!view || !Array.isArray(view.mine) || !Array.isArray(view.picker)) return null;
      if (typeof last.at !== 'string' || Number.isNaN(Date.parse(last.at))) return null;
      return { view, at: last.at };
    } catch {
      return null;
    }
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
      if (name === VIEW_FILE) continue;
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
