import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { ulid } from 'ulid';
import { z } from 'zod';
import {
  hostAllowed,
  isPrivateAddress,
  portsToTry,
  tableUrl,
  viewFor,
  visibleTokenIds,
  afterWrongPin,
  companionsOf,
  creatureKey,
  DragLocks,
  dropProblem,
  movementLocked,
  snapToCell,
  PREVIEWS_PER_SECOND,
  controller,
  summonProblem,
  rollForTable,
  TABLE_ROLL_MAX_LENGTH,
  type TableRoll,
  type AnyCreatureKind,
  type SummonRequest,
  type TableSummonEvent,
  type TableToken,
  decideClaim,
  intentProblem,
  pinLocked,
  UNDO_MS,
  type Claim,
  type PinTries,
} from '@trifold/rules';
import { NOTHING_SHARED, type SharedContent } from './sharedContent';
import type {
  ClientMessage,
  CreatureKind,
  ReclaimMode,
  ServerMessage,
  TableIntent,
  TableIntentEvent,
  TableTokenEvent,
  TableReleaseTarget,
  TableSnapshot,
  TableStatus,
} from '@trifold/api';
import type { PlayerDevice } from '@trifold/schema';
import type { AppConfigStore } from '../appConfig';
import type { IconResources } from '../icons';
import type { LibrarySession } from '../library/session';
import { errorMessage, type Logger } from '../log';
import { resolveMediaIcon, resolveMediaPath } from '../media';
import { lanAddresses, listenOnFirstFreePort, type BoundListener, type LanAddress } from './listen';
import { MdnsResponder } from './mdns';
import { pinMatches, PlayersStore } from './players';

/** Client messages, checked before anything reads them (CLAUDE.md: validate every intent). */
const Int = z.number().int().min(-100_000).max(100_000);
const IntentSchema: z.ZodType<TableIntent> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hp'), delta: Int }),
  z.object({ kind: z.literal('temp'), delta: Int }),
  z.object({ kind: z.literal('setTemp'), value: Int }),
  z.object({ kind: z.literal('maxHp'), value: Int }),
  z.object({ kind: z.literal('ac'), value: Int }),
  z.object({
    kind: z.literal('addCondition'),
    name: z.string().min(1).max(40),
    level: Int.optional(),
  }),
  z.object({ kind: z.literal('removeCondition'), id: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('initiative'), value: Int }),
]);
const CreatureKindSchema = z.enum(['pc', 'npc']);
const ClientMessageSchema: z.ZodType<ClientMessage> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), token: z.string().min(1).max(64).optional() }),
  z.object({
    type: z.literal('claim'),
    creatureKind: CreatureKindSchema,
    creatureId: z.string().min(1).max(64),
    label: z.string().max(40).optional(),
    pin: z.string().max(8).optional(),
  }),
  z.object({
    type: z.literal('intent'),
    creatureKind: z.enum(['pc', 'npc', 'summon']),
    creatureId: z.string().min(1).max(64),
    intent: IntentSchema,
  }),
  z.object({ type: z.literal('switch') }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('grab'), tokenId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('preview'),
    tokenId: z.string().min(1).max(64),
    x: z.number().finite(),
    y: z.number().finite(),
    from: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  }),
  z.object({ type: z.literal('hold'), tokenId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('drop'),
    tokenId: z.string().min(1).max(64),
    x: z.number().finite(),
    y: z.number().finite(),
    from: z.object({ x: z.number().finite(), y: z.number().finite() }),
  }),
  z.object({ type: z.literal('letGo'), tokenId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('releaseOne'),
    creatureKind: CreatureKindSchema,
    creatureId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('summon'),
    ownerKind: CreatureKindSchema,
    ownerId: z.string().min(1).max(64),
    optionKey: z.string().min(1).max(64),
    count: z.number().int().min(1).max(8),
    initiative: z.enum(['shared', 'own']),
    rounds: z.number().int().min(1).max(100).optional(),
    concentration: z.boolean(),
    persistent: z.boolean(),
  }),
  z.object({ type: z.literal('dismiss'), tokenId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('keepSummon'), tokenId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('roll'),
    expression: z.string().min(1).max(TABLE_ROLL_MAX_LENGTH),
  }),
]);

/** More than this many messages in a second from one browser are dropped (previews included). */
const MESSAGES_PER_SECOND = 30;
/** How often lapsed drag locks are swept. */
const LOCK_SWEEP_MS = 500;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const IMAGE_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const INTERFACE_POLL_MS = 10_000;
const HEARTBEAT_MS = 15_000;
const BROADCAST_DELAY_MS = 30;

interface Client {
  socket: WebSocket;
  deviceId: string | null;
  alive: boolean;
  /** The last state sent, so an unchanged view is not sent again. */
  last: string;
  /** Messages in the current second, for the rate limit. */
  window: { start: number; count: number };
}

/** A device waiting for the DM in Approval mode (held in memory only). */
interface ApprovalRequest {
  requestId: string;
  client: Client;
  kind: CreatureKind;
  id: string;
  label: string;
  creatureName: string;
  takeover: boolean;
  /** A summon waiting for the DM. */
  summon?: SummonRequest;
}

export interface TableHubOptions {
  config: AppConfigStore;
  session: LibrarySession;
  logger: Logger;
  icons: IconResources;
  /** The built player client (`out/web`). */
  webDir: string;
  onStatus(status: TableStatus): void;
  /** A checked player change for the console to apply. */
  onIntent(intent: TableIntentEvent): void;
  /** A player dragging or dropping a token. */
  onToken(event: TableTokenEvent): void;
  /** A player summoning, dismissing or keeping a summon. */
  onSummon(event: TableSummonEvent): void;
  /** A roll made at the table, for the DM's roll log. */
  onRoll?(roll: TableRoll): void;
  /**
   * Reads what the open campaign shares with its players (ADR 0060); `heldNpcIds` are the NPCs
   * some device holds now. Absent, nothing is shared.
   */
  shared?(heldNpcIds: ReadonlySet<string>): Promise<SharedContent>;
  /** Tests replace the network lookups. */
  addresses?: () => LanAddress[];
  mdns?: { start(): Promise<string>; announce(): void; stop(): Promise<void> } | null;
  /** Ports to try instead of the saved one and 80, 8130–8139 (the smoke test's own port). */
  ports?: number[];
}

/**
 * The table server (ADR 0043, docs/PLAYER-CONNECTOR.md): off until the DM starts it,
 * listening only on private LAN addresses. The console pushes a `TableSnapshot`; each browser
 * gets `viewFor` its device and nothing more. Devices and claims are kept in the campaign's
 * `players.json` through `PlayersStore`.
 */
export class TableHub {
  private state: TableStatus['state'] = 'off';
  private campaignId: string | null = null;
  private port: number | null = null;
  private addresses: LanAddress[] = [];
  private servers = new Map<string, { server: Server; listener: BoundListener }>();
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();
  private players: PlayersStore | null = null;
  private snapshot: TableSnapshot | null = null;
  private mapImage: { sceneId: string; imageKey: string; jpeg: Buffer } | null = null;
  private localName: string | null = null;
  private mdns: TableHubOptions['mdns'];
  private anyConnected = false;
  private startedAt: string | null = null;
  private error: string | null = null;
  private timers: NodeJS.Timeout[] = [];
  private broadcastTimer: NodeJS.Timeout | null = null;
  private approvals: ApprovalRequest[] = [];
  private pinTries = new Map<string, PinTries>();
  /** Switch character's undo: what each device released, until when. */
  private grace = new Map<string, { keys: Set<string>; until: number }>();
  private locks = new DragLocks();
  private lastPreview = new Map<string, number>();

  constructor(private readonly opts: TableHubOptions) {
    this.mdns = opts.mdns;
  }

  status(): TableStatus {
    const port = this.port;
    const on = this.state === 'on' && port !== null;
    const names = new Map(
      (this.snapshot?.creatures ?? []).map((c) => [`${c.kind}:${c.id}`, c.name] as const),
    );
    const online = new Set([...this.clients].map((c) => c.deviceId).filter(Boolean));
    const claims = this.players?.claims ?? [];
    const devices = (this.players?.devices ?? [])
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label,
        online: online.has(d.deviceId),
        lastSeen: d.lastSeen,
        claims: claims
          .filter((c) => c.deviceId === d.deviceId)
          .map((c) => ({
            kind: c.creatureKind,
            id: c.creatureId,
            name: names.get(`${c.creatureKind}:${c.creatureId}`) ?? 'Unknown',
          })),
      }))
      .filter((d) => d.claims.length || d.online);
    return {
      state: this.state,
      campaignId: this.campaignId,
      port,
      urls: on
        ? this.addresses.filter((a) => a.family === 'IPv4').map((a) => tableUrl(a.host, port))
        : [],
      localUrl: on && this.localName ? tableUrl(this.localName, port) : null,
      devices,
      connections: this.clients.size,
      sharedRecords: this.shared.records.length,
      anyConnected: this.anyConnected,
      startedAt: this.startedAt,
      error: this.error,
      reclaimMode: this.players?.reclaimMode ?? 'open',
      movement: this.players?.movement ?? { all: false, creatures: [] },
      approvals: this.approvals.map((a) => ({
        requestId: a.requestId,
        label: a.label,
        creatureName: a.creatureName,
        takeover: a.takeover,
        ...(a.summon
          ? {
              summon: {
                count: a.summon.count,
                name:
                  this.snapshot?.summonOptions?.find((o) => o.key === a.summon!.optionKey)?.name ??
                  'a creature',
              },
            }
          : {}),
      })),
      summoning: this.players?.summoning ?? { mode: 'on', cap: 8 },
    };
  }

  private emit(): void {
    this.opts.onStatus(this.status());
    // A claim or a release changes which NPCs' stat blocks players may see.
    void this.refreshShared();
  }

  // ---------- shared content (ADR 0060) ----------

  private shared: SharedContent = NOTHING_SHARED;
  /** What the content was last read for; unchanged, it is not read again. */
  private sharedKey: string | null = null;
  private sharedRead: Promise<void> = Promise.resolve();

  /** Homebrew or a source changed in the Library: what is shared may have, so look again. */
  sharedChanged(): void {
    this.sharedKey = null;
    void this.refreshShared();
  }

  /**
   * Reads the shared content again when something it depends on changed, and tells every known
   * device when the result differs. The content itself goes out only over `/shared`, to a
   * device that proves it is known.
   */
  private refreshShared(): Promise<void> {
    const read = this.opts.shared;
    const snapshot = this.snapshot;
    if (!read || !snapshot || this.state !== 'on') return this.sharedRead;
    const held = (this.players?.claims ?? [])
      .filter((c) => c.creatureKind === 'npc')
      .map((c) => c.creatureId)
      .sort();
    const key = JSON.stringify([
      snapshot.sharedKey ?? '',
      (snapshot.summonOptions ?? []).map((o) => o.key),
      held,
    ]);
    if (key === this.sharedKey) return this.sharedRead;
    this.sharedKey = key;
    const campaignId = this.campaignId;
    this.sharedRead = this.sharedRead
      .then(() => read(new Set(held)))
      .then((content) => {
        if (this.campaignId !== campaignId || content.hash === this.shared.hash) return;
        this.shared = content;
        // The DM's Shared with players tab says how much players have now.
        this.opts.onStatus(this.status());
        this.opts.logger.info(
          `table server: sharing ${content.records.length} records with players`,
        );
        for (const c of this.clients) {
          if (c.deviceId) this.send(c, { type: 'shared', hash: content.hash });
        }
      })
      .catch((err: unknown) => {
        this.sharedKey = null;
        this.opts.logger.warn(`table server: could not read shared content: ${errorMessage(err)}`);
      });
    return this.sharedRead;
  }

  /**
   * `/shared`: the shared records, for a device the table knows. The device proves it with its
   * token, the same secret that holds its claim, so a browser that merely reached the page gets
   * nothing.
   */
  private serveShared(req: IncomingMessage, res: ServerResponse, headers: object): void {
    const auth = req.headers.authorization ?? '';
    const token = /^Bearer ([A-Za-z0-9_-]{1,64})$/.exec(auth)?.[1];
    const device = token ? this.players?.deviceForToken(token) : null;
    if (!device) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
      return;
    }
    const body = Buffer.from(
      JSON.stringify({ hash: this.shared.hash, records: this.shared.records }),
      'utf8',
    );
    res.writeHead(200, {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async start(campaignId: string): Promise<TableStatus> {
    if (this.state !== 'off') {
      if (this.campaignId === campaignId) return this.status();
      await this.stop();
    }
    const { session, logger, config } = this.opts;
    const store = session.store;
    const campaigns = session.campaigns;
    if (!store || !campaigns) {
      this.error = 'Open a Library first.';
      this.emit();
      return this.status();
    }
    this.state = 'starting';
    this.campaignId = campaignId;
    this.error = null;
    this.anyConnected = false;
    this.emit();
    try {
      this.players = await PlayersStore.open(
        store,
        await campaigns.campaignDir(campaignId, 'players.json'),
      );
      this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
      this.addresses = (this.opts.addresses ?? lanAddresses)();
      const saved = config.get().tableServerPort;
      const bound = await listenOnFirstFreePort(
        this.addresses,
        this.opts.ports ?? portsToTry(saved),
        (host, port) => this.bind(host, port),
      );
      this.port = bound.port;
      if (bound.skipped.length) logger.info(`table server: skipped ${bound.skipped.join(', ')}`);
      if (!this.opts.ports && saved !== bound.port) {
        await config.update({ tableServerPort: bound.port });
        if (saved !== null) {
          this.error = `Port ${saved} was busy, so players join on port ${bound.port} now and will need to pick their characters again.`;
        }
      }
      this.state = 'on';
      this.startedAt = new Date().toISOString();
      logger.info(
        `table server on port ${bound.port}: ${this.addresses.map((a) => a.host).join(', ')}`,
      );
      this.timers.push(setInterval(() => void this.refreshInterfaces(), INTERFACE_POLL_MS));
      this.timers.push(setInterval(() => this.heartbeat(), HEARTBEAT_MS));
      this.timers.push(setInterval(() => this.sweepLocks(), LOCK_SWEEP_MS));
      this.emit();
      void this.startMdns();
    } catch (err) {
      logger.warn(`table server did not start: ${errorMessage(err)}`);
      const message = errorMessage(err);
      await this.stop();
      this.error = message;
      this.emit();
    }
    return this.status();
  }

  private async startMdns(): Promise<void> {
    if (this.mdns === undefined) {
      this.mdns = new MdnsResponder(
        () => this.addresses,
        // The table as a service, so a player's Trifold can list and find it (PLAYER-MODE.md).
        () =>
          this.state === 'on' && this.port !== null && this.campaignId
            ? {
                port: this.port,
                campaignId: this.campaignId,
                campaignName: this.snapshot?.campaignName ?? '',
              }
            : null,
      );
    }
    if (!this.mdns) return;
    try {
      this.localName = await this.mdns.start();
      this.opts.logger.info(`table server: answering as ${this.localName}`);
    } catch (err) {
      this.localName = null;
      this.opts.logger.warn(`table server: no local name (${errorMessage(err)})`);
    }
    if (this.state === 'on') this.emit();
  }

  async stop(): Promise<TableStatus> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = null;
    for (const c of this.clients) {
      this.send(c, { type: 'closed' });
      c.socket.close(1001, 'stopped');
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
    await Promise.all([...this.servers.values()].map(({ listener }) => listener.close()));
    this.servers.clear();
    if (this.mdns) await this.mdns.stop().catch(() => undefined);
    this.localName = null;
    if (this.players) {
      await this.players.save().catch((err: unknown) => {
        this.opts.logger.warn(`could not save players.json: ${errorMessage(err)}`);
      });
    }
    const wasOn = this.state !== 'off';
    this.players = null;
    this.approvals = [];
    this.pinTries.clear();
    this.grace.clear();
    this.locks.clear();
    this.lastPreview.clear();
    this.snapshot = null;
    this.shared = NOTHING_SHARED;
    this.sharedKey = null;
    this.mapImage = null;
    this.state = 'off';
    this.campaignId = null;
    this.port = null;
    this.startedAt = null;
    this.error = null;
    if (wasOn) this.opts.logger.info('table server stopped');
    this.emit();
    return this.status();
  }

  async release(target: TableReleaseTarget): Promise<TableStatus> {
    if (!this.players) return this.status();
    const holder =
      target === 'all' ? null : (this.players.claimOf(target.kind, target.id)?.deviceId ?? null);
    if (await this.players.release(target)) {
      if (target !== 'all' && target.kind === 'pc' && holder) {
        await this.releaseCompanions(target.id, holder);
      }
      if (holder) this.locks.releaseDevice(holder);
      if (target === 'all') this.locks.clear();
      const what = target === 'all' ? 'every claim' : `${target.kind} ${target.id}`;
      this.opts.logger.info(`table server: DM released ${what}`);
      this.scheduleBroadcast();
    }
    this.emit();
    return this.status();
  }

  async setReclaimMode(mode: ReclaimMode): Promise<TableStatus> {
    if (this.players) {
      await this.players.setReclaimMode(mode);
      this.opts.logger.info(`table server: reclaim mode ${mode}`);
      this.scheduleBroadcast(0);
    }
    this.emit();
    return this.status();
  }

  /** Accept or Deny a device waiting in Approval mode. */
  async answer(requestId: string, accept: boolean): Promise<TableStatus> {
    const request = this.approvals.find((a) => a.requestId === requestId);
    this.approvals = this.approvals.filter((a) => a.requestId !== requestId);
    if (request?.summon) {
      if (accept) this.spawn(request.client, request.summon, true);
      else if (request.client.socket.readyState === request.client.socket.OPEN) {
        this.send(request.client, { type: 'error', message: 'The DM said no to that summon.' });
      }
    } else if (request && request.client.socket.readyState === request.client.socket.OPEN) {
      if (accept) {
        await this.grant(request.client, request.kind, request.id, request.label);
      } else {
        this.send(request.client, {
          type: 'error',
          message: `The DM kept ${request.creatureName} where it is.`,
        });
        this.opts.logger.info(`table server: DM denied ${request.kind} ${request.id}`);
      }
    }
    this.emit();
    return this.status();
  }

  push(snapshot: TableSnapshot): void {
    if (this.state !== 'on' || snapshot.campaignId !== this.campaignId) return;
    const namesChanged =
      JSON.stringify(this.snapshot?.creatures.map((c) => c.name)) !==
      JSON.stringify(snapshot.creatures.map((c) => c.name));
    const campaignNamed = this.snapshot?.campaignName !== snapshot.campaignName;
    this.snapshot = snapshot;
    this.scheduleBroadcast();
    void this.refreshShared();
    if (namesChanged) this.emit();
    // The advertised service carries the campaign's name: say it again when it is first known
    // or renamed.
    if (campaignNamed && this.localName) this.mdns?.announce();
  }

  setMapImage(sceneId: string, imageKey: string, jpeg: Uint8Array): void {
    if (this.state !== 'on') return;
    this.mapImage = { sceneId, imageKey, jpeg: Buffer.from(jpeg) };
    this.scheduleBroadcast();
  }

  // ---------- sockets ----------

  private bind(host: string, port: number): Promise<BoundListener> {
    return new Promise((resolveBind, reject) => {
      const server = createServer((req, res) => void this.handle(req, res));
      server.on('upgrade', (req, socket, head) => this.upgrade(req, socket, head));
      server.once('error', reject);
      server.listen({ host, port, exclusive: true }, () => {
        server.removeListener('error', reject);
        server.on('error', (err) =>
          this.opts.logger.warn(`table server ${host}: ${errorMessage(err)}`),
        );
        const listener: BoundListener = {
          host,
          close: () =>
            new Promise((done) => {
              server.closeAllConnections();
              server.close(() => done());
            }),
        };
        this.servers.set(host, { server, listener });
        resolveBind(listener);
      });
    });
  }

  /** Listeners follow the machine's addresses as DHCP or Wi-Fi changes them. */
  private async refreshInterfaces(): Promise<void> {
    if (this.state !== 'on' || this.port === null) return;
    const next = (this.opts.addresses ?? lanAddresses)();
    const want = new Set(next.map((a) => a.host));
    let changed = false;
    for (const [host, { listener }] of this.servers) {
      if (!want.has(host)) {
        await listener.close();
        this.servers.delete(host);
        changed = true;
      }
    }
    for (const a of next) {
      if (this.servers.has(a.host)) continue;
      try {
        await this.bind(a.host, this.port);
        changed = true;
      } catch (err) {
        this.opts.logger.warn(`table server: could not listen on ${a.host}: ${errorMessage(err)}`);
      }
    }
    const listening = new Set(this.servers.keys());
    this.addresses = next.filter((a) => listening.has(a.host));
    if (changed) {
      this.mdns?.announce();
      this.emit();
    }
  }

  private hosts(): string[] {
    return [
      ...this.addresses.map((a) => a.host.replace(/%.*$/, '')),
      ...(this.localName ? [this.localName] : []),
    ];
  }

  /** The private-address and Host checks every request and upgrade passes. */
  private allowed(req: IncomingMessage): boolean {
    const remote = req.socket.remoteAddress ?? '';
    if (!isPrivateAddress(remote)) return false;
    return this.port !== null && hostAllowed(req.headers.host, this.hosts(), this.port);
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const origin = req.headers.origin;
    const port = this.port;
    const sameOrigin =
      !!origin &&
      port !== null &&
      this.hosts().some((h) => origin.toLowerCase() === tableUrl(h, port).toLowerCase());
    if (
      !this.wss ||
      !this.allowed(req) ||
      !sameOrigin ||
      new URL(req.url ?? '/', 'http://x').pathname !== '/ws'
    ) {
      this.opts.logger.warn(`table server: refused a connection from ${req.socket.remoteAddress}`);
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws));
  }

  private connect(socket: WebSocket): void {
    const client: Client = {
      socket,
      deviceId: null,
      alive: true,
      last: '',
      window: { start: Date.now(), count: 0 },
    };
    this.clients.add(client);
    this.anyConnected = true;
    socket.on('pong', () => (client.alive = true));
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      void this.receive(client, String(data));
    });
    socket.on('close', () => {
      this.clients.delete(client);
      this.approvals = this.approvals.filter((a) => a.client !== client);
      if (client.deviceId) this.players?.touch(client.deviceId);
      // A drag dies with its page (when no other page of that device is open).
      if (client.deviceId && !this.clientsOf(client.deviceId).length) {
        for (const tokenId of this.locks.releaseDevice(client.deviceId)) {
          this.opts.onToken({ kind: 'previewEnd', tokenId });
        }
      }
      this.emit();
    });
    socket.on('error', () => undefined);
    if (this.campaignId) {
      this.send(client, {
        type: 'campaign',
        campaignId: this.campaignId,
        campaignName: this.snapshot?.campaignName ?? '',
        now: Date.now(),
      });
    }
    this.emit();
  }

  private heartbeat(): void {
    for (const c of this.clients) {
      if (!c.alive) {
        c.socket.terminate();
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }

  private async receive(client: Client, text: string): Promise<void> {
    const now = Date.now();
    if (now - client.window.start >= 1000) client.window = { start: now, count: 0 };
    client.window.count += 1;
    if (client.window.count > MESSAGES_PER_SECOND) return;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return this.reject(client, 'bad message');
    }
    const parsed = ClientMessageSchema.safeParse(raw);
    if (!parsed.success) return this.reject(client, 'bad message');
    const msg = parsed.data;
    const players = this.players;
    if (!players) return;
    if (msg.type === 'hello') {
      const device = msg.token ? players.deviceForToken(msg.token) : null;
      client.deviceId = device?.deviceId ?? null;
      if (device) players.touch(device.deviceId);
      client.last = '';
      this.sendState(client);
      // A known device learns what is shared now; one that holds something else fetches it.
      if (device) this.send(client, { type: 'shared', hash: this.shared.hash });
      this.emit();
      return;
    }
    switch (msg.type) {
      case 'claim':
        return this.claim(client, msg.creatureKind, msg.creatureId, msg.label ?? '', msg.pin);
      case 'intent':
        return this.intent(client, msg.creatureKind, msg.creatureId, msg.intent);
      case 'switch':
        return this.switchCharacter(client);
      case 'undo':
        return this.undo(client);
      case 'cancel':
        this.approvals = this.approvals.filter((r) => r.client !== client);
        this.emit();
        return;
      case 'grab':
        return this.grab(client, msg.tokenId);
      case 'preview':
        return this.preview(client, msg.tokenId, msg.x, msg.y, msg.from);
      case 'hold':
        return this.hold(client, msg.tokenId);
      case 'drop':
        return this.drop(client, msg.tokenId, { x: msg.x, y: msg.y }, msg.from);
      case 'letGo':
        return this.letGo(client, msg.tokenId);
      case 'releaseOne':
        return this.releaseOne(client, msg.creatureKind, msg.creatureId);
      case 'summon': {
        const { type: _type, ...request } = msg;
        return this.spawn(client, request, false);
      }
      case 'dismiss':
      case 'keepSummon':
        return this.summonAction(client, msg.type === 'dismiss' ? 'dismiss' : 'keep', msg.tokenId);
      case 'roll':
        return this.roll(client, msg.expression);
    }
  }

  private device(client: Client): PlayerDevice | null {
    return client.deviceId
      ? (this.players?.devices.find((d) => d.deviceId === client.deviceId) ?? null)
      : null;
  }

  private online(): Set<string> {
    return new Set([...this.clients].map((c) => c.deviceId).filter((d): d is string => !!d));
  }

  private nameOf(kind: CreatureKind, id: string): string {
    return this.snapshot?.creatures.find((c) => c.kind === kind && c.id === id)?.name ?? id;
  }

  /**
   * A tap in the picker: a first claim, a reclaim or a takeover, decided by
   * `decideClaim` through the campaign's reclaim mode.
   */
  private async claim(
    client: Client,
    kind: CreatureKind,
    id: string,
    label: string,
    pin: string | undefined,
  ): Promise<void> {
    const players = this.players!;
    const creature = this.snapshot?.creatures.find((c) => c.kind === kind && c.id === id);
    if (!creature) return this.reject(client, 'That character can’t be picked right now.');
    const key = `${kind}:${id}`;
    const held = players.claimOf(kind, id);
    const now = Date.now();
    const grace = this.grace.get(client.deviceId ?? '');
    const outcome = decideClaim({
      mode: players.reclaimMode,
      offered: creature.claimable,
      held: !!held,
      heldByAsker: !!held && held.deviceId === client.deviceId,
      grace: !!grace && grace.until > now && grace.keys.has(key),
      pin,
      hasPin: !!held?.pinHash,
      pinMatches: (p) => !!held?.pinHash && pinMatches(p, held.pinHash),
      locked: pinLocked(this.pinTries.get(key), now),
    });
    switch (outcome) {
      case 'own':
        return this.sendState(client);
      case 'notOffered':
        return this.reject(client, 'That character can’t be picked right now.');
      case 'pinNeeded':
        return this.reject(client, held ? 'Enter the 4-digit PIN.' : 'Choose a 4-digit PIN.');
      case 'pinWrong': {
        const tries = afterWrongPin(this.pinTries.get(key), now);
        this.pinTries.set(key, tries);
        return this.reject(
          client,
          pinLocked(tries, now) ? 'Too many wrong PINs. Wait a minute.' : 'That PIN is not right.',
        );
      }
      case 'locked':
        return this.reject(client, 'Too many wrong PINs. Wait a minute.');
      case 'approval':
        this.approvals = [
          ...this.approvals.filter((r) => r.client !== client),
          {
            requestId: ulid(),
            client,
            kind,
            id,
            label: label.trim() || this.device(client)?.label || 'A device',
            creatureName: creature.name,
            takeover: !!held && this.online().has(held.deviceId),
          },
        ];
        this.send(client, { type: 'waiting', creatureName: creature.name });
        this.opts.logger.info(`table server: asked the DM for ${kind} ${id}`);
        this.emit();
        return;
      case 'grant':
        this.pinTries.delete(key);
        return this.grant(
          client,
          kind,
          id,
          label,
          !held && players.reclaimMode === 'pin' ? pin : undefined,
        );
    }
  }

  /** Gives a creature to a client's device, moving it from any device that held it. */
  private async grant(
    client: Client,
    kind: CreatureKind,
    id: string,
    label: string,
    pin?: string,
  ): Promise<void> {
    const players = this.players;
    if (!players) return;
    const name = this.nameOf(kind, id);
    try {
      const { device, token, from } = await players.claim(
        kind,
        id,
        this.device(client),
        label,
        new Date(),
        { ...(pin ? { pin } : {}), takeOver: true },
      );
      client.deviceId = device.deviceId;
      if (kind === 'pc') await this.companionsFollow(id, device.deviceId, from);
      if (token && this.campaignId) {
        this.send(client, { type: 'token', token, campaignId: this.campaignId });
      }
      if (from && from !== device.deviceId) {
        this.locks.releaseDevice(from);
        for (const c of this.clients) {
          if (c.deviceId === from) {
            this.send(c, { type: 'error', message: `${name} was picked up on another device.` });
          }
        }
      }
      this.grace.delete(device.deviceId);
      this.opts.logger.info(
        `table server: ${device.label || device.deviceId} ${from ? 'took' : 'claimed'} ${kind} ${id}`,
      );
    } catch (err) {
      this.opts.logger.warn(`table server: claim failed: ${errorMessage(err)}`);
      return this.reject(client, 'Could not save that. Try again.');
    }
    this.scheduleBroadcast(0);
    this.emit();
  }

  /** A player's change: checked here, applied by the console. */
  private intent(client: Client, kind: AnyCreatureKind, id: string, intent: TableIntent): void {
    const creature = this.snapshot?.creatures.find((c) => c.kind === kind && c.id === id);
    if (!creature) return this.reject(client, 'That character isn’t on the table right now.');
    // A summon answers to whoever holds its owner.
    const owner = controller(creature);
    const held = this.players?.claimOf(owner.kind, owner.id);
    if (!held || held.deviceId !== client.deviceId) {
      return this.reject(client, 'That character isn’t yours on this device.');
    }
    const problem = intentProblem(intent, creature);
    if (problem) return this.reject(client, problem);
    this.opts.onIntent({
      deviceLabel: this.device(client)?.label || 'A player',
      creatureKind: kind,
      creatureId: id,
      intent,
    });
  }

  // ---------- table rolls ----------

  private rollSeq = 0;

  /**
   * A Table roll (ADR 0059): a player holding a character asks, the roll is made here on the
   * DM's machine, and the result goes to the DM's roll log and to every device at the table
   * that holds a creature. It is named for the player's character. Nothing is kept: a device
   * that connects later sees rolls from then on.
   */
  private roll(client: Client, expression: string): void {
    const claims = (this.players?.claims ?? []).filter((c) => c.deviceId === client.deviceId);
    if (!client.deviceId || claims.length === 0) {
      return this.reject(client, 'Pick a character before rolling at the table.');
    }
    const made = rollForTable(expression);
    if (!made.ok) return this.reject(client, made.problem);
    // The player's own character names the roll; a companion only when that is all they hold.
    const held = claims.find((c) => c.creatureKind === 'pc') ?? claims[0]!;
    const by =
      this.snapshot?.creatures.find((c) => c.kind === held.creatureKind && c.id === held.creatureId)
        ?.name ??
      this.device(client)?.label ??
      'A player';
    const at = Date.now();
    const roll: TableRoll = { id: `table-${at}-${++this.rollSeq}`, at, by, ...made.roll };
    const holding = new Set((this.players?.claims ?? []).map((c) => c.deviceId));
    for (const c of this.clients) {
      if (c.deviceId && holding.has(c.deviceId)) this.send(c, { type: 'rolled', roll });
    }
    this.opts.onRoll?.(roll);
  }

  // ---------- movement ----------

  /** Token id → who is dragging it, for the phones' "moving" mark. */
  private draggingNow(): Map<string, { deviceId: string; label: string }> {
    const out = new Map<string, { deviceId: string; label: string }>();
    for (const [tokenId, deviceId] of this.locks.active(Date.now())) {
      const label = this.players?.devices.find((d) => d.deviceId === deviceId)?.label;
      out.set(tokenId, { deviceId, label: label || 'Another player' });
    }
    return out;
  }

  private clientsOf(deviceId: string): Client[] {
    return [...this.clients].filter((c) => c.deviceId === deviceId);
  }

  /** Ends a drag without moving the token, telling its phone why and the console to forget it. */
  private endDrag(tokenId: string, deviceId: string, reason: string): void {
    for (const c of this.clientsOf(deviceId)) this.send(c, { type: 'dragEnded', tokenId, reason });
    this.lastPreview.delete(tokenId);
    this.opts.onToken({ kind: 'previewEnd', tokenId });
    this.scheduleBroadcast();
  }

  /** The token a device may drag, or why not. */
  private movable(client: Client, tokenId: string): { token: TableToken } | { problem: string } {
    const scene = this.snapshot?.scene;
    const token = scene?.tokens.find((t) => t.id === tokenId);
    const ref = token?.creature;
    const creature = ref
      ? this.snapshot?.creatures.find((c) => c.kind === ref.kind && c.id === ref.id)
      : undefined;
    if (!scene || !token || !creature) return { problem: 'That token isn’t on the map.' };
    const owner = controller(creature);
    const held = this.players?.claimOf(owner.kind, owner.id);
    if (!held || held.deviceId !== client.deviceId) return { problem: 'That token isn’t yours.' };
    if (token.hidden) return { problem: 'That token is hidden.' };
    if (movementLocked(this.players!.movement, owner.kind, owner.id)) {
      return { problem: 'Movement locked by the DM.' };
    }
    return { token };
  }

  private grab(client: Client, tokenId: string): void {
    const ok = this.movable(client, tokenId);
    if ('problem' in ok) {
      return this.send(client, { type: 'dragEnded', tokenId, reason: ok.problem });
    }
    if (!this.locks.grant(tokenId, client.deviceId!, Date.now())) {
      return this.send(client, {
        type: 'dragEnded',
        tokenId,
        reason: 'Someone else is moving it.',
      });
    }
    this.send(client, { type: 'grabbed', tokenId });
    this.scheduleBroadcast();
  }

  private preview(
    client: Client,
    tokenId: string,
    x: number,
    y: number,
    from?: { x: number; y: number },
  ): void {
    const now = Date.now();
    if (!client.deviceId || !this.locks.refresh(tokenId, client.deviceId, now)) return;
    const last = this.lastPreview.get(tokenId) ?? 0;
    if (now - last < 1000 / PREVIEWS_PER_SECOND) return;
    this.lastPreview.set(tokenId, now);
    this.opts.onToken({
      kind: 'preview',
      tokenId,
      x,
      y,
      deviceLabel: this.device(client)?.label || 'A player',
      ...(from ? { from } : {}),
    });
  }

  private drop(
    client: Client,
    tokenId: string,
    to: { x: number; y: number },
    from: { x: number; y: number },
  ): void {
    const deviceId = client.deviceId;
    if (!deviceId) return;
    // A lock that lapsed while the phone slept or reconnected is taken back here, so a planned
    // move still lands; only another device's drag refuses it.
    if (!this.locks.grant(tokenId, deviceId, Date.now())) {
      return this.send(client, {
        type: 'dragEnded',
        tokenId,
        reason: 'Someone else is moving it.',
      });
    }
    this.locks.release(tokenId);
    const ok = this.movable(client, tokenId);
    const scene = this.snapshot?.scene;
    const target = snapToCell(to);
    const problem =
      'problem' in ok ? ok.problem : scene ? dropProblem(scene, ok.token, target, from) : 'No map.';
    if (problem) {
      this.opts.logger.info(`table server: refused a drop of ${tokenId} (${problem})`);
      return this.endDrag(tokenId, deviceId, problem);
    }
    this.lastPreview.delete(tokenId);
    this.opts.onToken({
      kind: 'move',
      tokenId,
      x: target.x,
      y: target.y,
      deviceLabel: this.device(client)?.label || 'A player',
    });
    this.scheduleBroadcast();
  }

  /**
   * The phone's heartbeat while a move waits for Done. A lock that lapsed (the phone slept, or
   * its page reconnected) is granted again when the token is still free and still theirs.
   */
  private hold(client: Client, tokenId: string): void {
    const deviceId = client.deviceId;
    if (!deviceId) return;
    const now = Date.now();
    if (this.locks.refresh(tokenId, deviceId, now)) return;
    if (this.locks.holder(tokenId, now)) return;
    if ('problem' in this.movable(client, tokenId)) return;
    if (this.locks.grant(tokenId, deviceId, now)) this.scheduleBroadcast();
  }

  private letGo(client: Client, tokenId: string): void {
    if (!client.deviceId || this.locks.holder(tokenId, Date.now()) !== client.deviceId) return;
    this.locks.release(tokenId);
    this.lastPreview.delete(tokenId);
    this.opts.onToken({ kind: 'previewEnd', tokenId });
    this.scheduleBroadcast();
  }

  private sweepLocks(): void {
    // The phone is not told: its plan stays, and its next hold or Done takes the lock back.
    for (const { tokenId } of this.locks.sweep(Date.now())) {
      this.lastPreview.delete(tokenId);
      this.opts.onToken({ kind: 'previewEnd', tokenId });
      this.scheduleBroadcast();
    }
  }

  /** The DM grabbed a token: a player's drag on it ends at once (DM priority). */
  dmGrab(tokenId: string): void {
    const holder = this.locks.release(tokenId);
    if (!holder) return;
    const token = this.snapshot?.scene?.tokens.find((t) => t.id === tokenId);
    this.endDrag(tokenId, holder, `The DM moved ${token?.label ?? 'it'}.`);
  }

  async setMovementLock(
    target: 'all' | { kind: CreatureKind; id: string },
    locked: boolean,
  ): Promise<TableStatus> {
    if (this.players) {
      await this.players.setMovementLock(
        target === 'all' ? 'all' : creatureKey(target.kind, target.id),
        locked,
      );
      if (locked) {
        // Drags already going on stop with the lock.
        for (const [tokenId, deviceId] of this.locks.active(Date.now())) {
          const ref = this.snapshot?.scene?.tokens.find((t) => t.id === tokenId)?.creature;
          const found = ref
            ? this.snapshot?.creatures.find((x) => x.kind === ref.kind && x.id === ref.id)
            : undefined;
          const c = found ? controller(found) : null;
          if (c && movementLocked(this.players.movement, c.kind, c.id)) {
            this.locks.release(tokenId);
            this.endDrag(tokenId, deviceId, 'Movement locked by the DM.');
          }
        }
      }
      this.opts.logger.info(
        `table server: movement ${locked ? 'locked' : 'unlocked'} for ${target === 'all' ? 'everyone' : `${target.kind} ${target.id}`}`,
      );
      this.scheduleBroadcast(0);
    }
    this.emit();
    return this.status();
  }

  // ---------- companions and Give to… ----------

  /** A PC's companions follow it to a device, unless another device holds them. */
  private async companionsFollow(pcId: string, deviceId: string, from: string | null) {
    const players = this.players;
    if (!players || !this.snapshot) return;
    const device = players.devices.find((d) => d.deviceId === deviceId) ?? null;
    for (const c of companionsOf(this.snapshot.creatures, pcId)) {
      const held = players.claimOf(c.kind, c.id);
      if (held && held.deviceId !== from) continue;
      if (held?.deviceId === deviceId) continue;
      await players.claim(c.kind, c.id, device, '', new Date(), { takeOver: true });
    }
  }

  /** Releasing a PC releases the companions the same device holds. */
  private async releaseCompanions(pcId: string, deviceId: string | null) {
    const players = this.players;
    if (!players || !this.snapshot) return;
    for (const c of companionsOf(this.snapshot.creatures, pcId)) {
      const held = players.claimOf(c.kind, c.id);
      if (held && (deviceId === null || held.deviceId === deviceId)) {
        await players.release({ kind: c.kind, id: c.id });
      }
    }
  }

  /** A companion's chip Release: that creature alone. */
  private async releaseOne(client: Client, kind: CreatureKind, id: string): Promise<void> {
    const held = this.players?.claimOf(kind, id);
    if (!held || held.deviceId !== client.deviceId) return;
    await this.players!.release({ kind, id });
    this.locks.releaseDevice(client.deviceId!);
    this.scheduleBroadcast(0);
    this.emit();
  }

  /** Give to…: the DM hands a PC or NPC to a connected device. */
  async give(target: { kind: CreatureKind; id: string }, deviceId: string): Promise<TableStatus> {
    const players = this.players;
    const device = players?.devices.find((d) => d.deviceId === deviceId);
    if (!players || !device) return this.status();
    const before = players.claimOf(target.kind, target.id)?.deviceId ?? null;
    const { from } = await players.claim(target.kind, target.id, device, '', new Date(), {
      takeOver: true,
    });
    if (target.kind === 'pc') await this.companionsFollow(target.id, deviceId, before);
    const name = this.nameOf(target.kind, target.id);
    if (from && from !== deviceId) {
      for (const c of this.clientsOf(from)) {
        this.send(c, { type: 'error', message: `The DM gave ${name} to another device.` });
      }
    }
    this.opts.logger.info(`table server: DM gave ${target.kind} ${target.id} to ${deviceId}`);
    this.scheduleBroadcast(0);
    this.emit();
    return this.status();
  }

  // ---------- summoning ----------

  async setSummoning(summoning: {
    mode: 'on' | 'approval' | 'off';
    cap: number;
  }): Promise<TableStatus> {
    if (this.players) {
      await this.players.setSummoning(summoning);
      this.opts.logger.info(`table server: summoning ${summoning.mode}, cap ${summoning.cap}`);
      this.scheduleBroadcast(0);
    }
    this.emit();
    return this.status();
  }

  /**
   * A summon from a phone: checked here (summoning on, the owner held by this device, the
   * creature on the DM's list, a map with the owner on it, the cap), then asked of the DM in
   * Approval mode, else handed to the console to place.
   */
  private spawn(client: Client, request: SummonRequest, approved: boolean): void {
    const players = this.players;
    const snapshot = this.snapshot;
    if (!players || !snapshot) return;
    const held = players.claimOf(request.ownerKind, request.ownerId);
    const ownerOnMap = !!snapshot.scene?.tokens.some(
      (t) =>
        t.creature?.kind === request.ownerKind && t.creature.id === request.ownerId && !t.hidden,
    );
    const inPlay = snapshot.creatures.filter(
      (c) => c.summon?.owner.kind === request.ownerKind && c.summon.owner.id === request.ownerId,
    ).length;
    const option = snapshot.summonOptions?.find((o) => o.key === request.optionKey);
    const problem =
      summonProblem({
        mode: players.summoning.mode,
        request,
        ownerHeld: !!held && held.deviceId === client.deviceId,
        optionExists: !!option,
        hasMap: !!snapshot.scene,
        inPlay,
        cap: players.summoning.cap,
      }) ??
      (ownerOnMap
        ? null
        : `Put ${this.nameOf(request.ownerKind, request.ownerId)} on the map first.`);
    if (problem) return this.reject(client, problem);
    const label = this.device(client)?.label || 'A player';
    if (players.summoning.mode === 'approval' && !approved) {
      this.approvals = [
        ...this.approvals,
        {
          requestId: ulid(),
          client,
          kind: request.ownerKind,
          id: request.ownerId,
          label,
          creatureName: this.nameOf(request.ownerKind, request.ownerId),
          takeover: false,
          summon: request,
        },
      ];
      this.send(client, {
        type: 'error',
        message: `Asked the DM to summon ${option!.name}. It appears when they say yes.`,
      });
      this.emit();
      return;
    }
    this.opts.logger.info(
      `table server: ${label} summons ${request.count} ${option!.name} for ${request.ownerKind} ${request.ownerId}`,
    );
    this.opts.onSummon({ kind: 'spawn', deviceLabel: label, ...request });
  }

  /** Dismiss a summon, or keep one whose owner's concentration broke. */
  private summonAction(client: Client, action: 'dismiss' | 'keep', tokenId: string): void {
    const creature = this.snapshot?.creatures.find((c) => c.kind === 'summon' && c.id === tokenId);
    if (!creature?.summon) return this.reject(client, 'That summon is gone.');
    const owner = creature.summon.owner;
    const held = this.players?.claimOf(owner.kind, owner.id);
    if (!held || held.deviceId !== client.deviceId) {
      return this.reject(client, 'That summon isn’t yours on this device.');
    }
    this.opts.onSummon(
      action === 'dismiss'
        ? { kind: 'dismiss', tokenId, deviceLabel: this.device(client)?.label || 'A player' }
        : { kind: 'keep', tokenId },
    );
  }

  /** Switch character: release everything this device holds, with a few seconds to undo. */
  private async switchCharacter(client: Client): Promise<void> {
    const deviceId = client.deviceId;
    if (!deviceId || !this.players) return;
    const released = await this.players.releaseDevice(deviceId);
    for (const tokenId of this.locks.releaseDevice(deviceId)) {
      this.opts.onToken({ kind: 'previewEnd', tokenId });
    }
    if (!released.length) return this.sendState(client);
    this.grace.set(deviceId, {
      keys: new Set(released.map((c) => `${c.creatureKind}:${c.creatureId}`)),
      until: Date.now() + UNDO_MS,
    });
    const names = released.map((c) => this.nameOf(c.creatureKind, c.creatureId));
    this.send(client, { type: 'released', names, undoMs: UNDO_MS });
    this.opts.logger.info(`table server: ${deviceId} switched character`);
    this.scheduleBroadcast(0);
    this.emit();
  }

  /** Undo: take back what Switch character released, if nobody claimed it meanwhile. */
  private async undo(client: Client): Promise<void> {
    const deviceId = client.deviceId;
    const grace = deviceId ? this.grace.get(deviceId) : undefined;
    if (deviceId) this.grace.delete(deviceId);
    if (!grace || grace.until < Date.now() || !this.players) return;
    for (const key of grace.keys) {
      const [kind, id] = key.split(':') as [CreatureKind, string];
      if (this.players.claimOf(kind, id)) continue;
      await this.players.claim(kind, id, this.device(client), '', new Date(), { takeOver: true });
    }
    this.scheduleBroadcast(0);
    this.emit();
  }

  private reject(client: Client, message: string): void {
    this.opts.logger.info(`table server: rejected (${message})`);
    this.send(client, { type: 'error', message });
  }

  private send(client: Client, msg: ServerMessage): void {
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(msg));
  }

  private claimList(): Claim[] {
    return (this.players?.claims ?? []).map((c) => ({
      creatureKind: c.creatureKind,
      creatureId: c.creatureId,
      deviceId: c.deviceId,
    }));
  }

  private hasImageFor(snapshot: TableSnapshot): boolean {
    const scene = snapshot.scene;
    return (
      !!scene &&
      !!this.mapImage &&
      this.mapImage.sceneId === scene.id &&
      this.mapImage.imageKey === scene.imageKey
    );
  }

  private sendState(client: Client): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const view = viewFor(snapshot, this.claimList(), client.deviceId, this.hasImageFor(snapshot), {
      reclaimMode: this.players?.reclaimMode ?? 'open',
      online: this.online(),
      movement: this.players?.movement ?? { all: false, creatures: [] },
      dragging: this.draggingNow(),
      summoning: this.players?.summoning ?? { mode: 'on', cap: 8 },
    });
    const text = JSON.stringify({ type: 'state', ...view } satisfies ServerMessage);
    if (text === client.last) return;
    client.last = text;
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(text);
  }

  private scheduleBroadcast(delay = BROADCAST_DELAY_MS): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      for (const c of this.clients) this.sendState(c);
    }, delay);
  }

  // ---------- HTTP ----------

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.allowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const common = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
    try {
      const map = /^\/map\/([^/]+)\/([^/]+)\.jpg$/.exec(path);
      if (map) {
        const img = this.mapImage;
        if (!img || img.sceneId !== map[1] || img.imageKey !== map[2]) return this.notFound(res);
        res.writeHead(200, {
          ...common,
          'Content-Type': 'image/jpeg',
          'Content-Length': img.jpeg.length,
          'Cache-Control': 'private, max-age=86400, immutable',
        });
        res.end(req.method === 'HEAD' ? undefined : img.jpeg);
        return;
      }
      if (path === '/shared') return this.serveShared(req, res, common);
      const tokenArt = /^\/t\/([^/]+)\/(art|glyph)$/.exec(path);
      if (tokenArt)
        return await this.serveTokenArt(res, tokenArt[1]!, tokenArt[2] as 'art' | 'glyph', common);
      // An image scene's picture, while it is on the TV (all screen types on phones).
      const screenImage = /^\/screen\/([^/]+)\/image$/.exec(path);
      if (screenImage) {
        const screen = this.snapshot?.screen;
        const src =
          screen?.kind === 'image' && screen.id === screenImage[1] ? screen.src : undefined;
        return await this.serveMedia(res, src, common);
      }
      const portrait = /^\/c\/(pc|npc|summon)\/([^/]+)\/portrait$/.exec(path);
      if (portrait) {
        const c = this.snapshot?.creatures.find(
          (x) => x.kind === portrait[1] && x.id === portrait[2],
        );
        return await this.serveMedia(res, c?.portraitSrc, common);
      }
      return await this.serveStatic(res, path, req, common);
    } catch (err) {
      this.opts.logger.warn(`table server: ${path}: ${errorMessage(err)}`);
      if (!res.headersSent) res.writeHead(500).end();
    }
  }

  private notFound(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }

  /** Token pictures, only for tokens some connected device can see. */
  private async serveTokenArt(
    res: ServerResponse,
    tokenId: string,
    which: 'art' | 'glyph',
    headers: Record<string, string>,
  ): Promise<void> {
    const snapshot = this.snapshot;
    if (!snapshot) return this.notFound(res);
    const claims = this.claimList();
    const seen = [...this.clients].some((c) =>
      visibleTokenIds(snapshot, claims, c.deviceId).has(tokenId),
    );
    const token = seen ? snapshot.scene?.tokens.find((t) => t.id === tokenId) : undefined;
    return this.serveMedia(res, which === 'art' ? token?.artSrc : token?.glyphSrc, headers);
  }

  private async serveMedia(
    res: ServerResponse,
    src: string | undefined,
    headers: Record<string, string>,
  ): Promise<void> {
    const svgHeaders = {
      'Cache-Control': 'private, max-age=86400',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    };
    const glyph = src ? resolveMediaIcon(src, this.opts.icons) : null;
    if (glyph !== null) {
      const body = Buffer.from(glyph, 'utf8');
      res.writeHead(200, {
        ...headers,
        'Content-Type': CONTENT_TYPES['.svg']!,
        'Content-Length': body.length,
        ...svgHeaders,
      });
      res.end(body);
      return;
    }
    const file = src ? resolveMediaPath(src, this.opts.session) : null;
    const ext = file ? extname(file).toLowerCase() : '';
    if (!file || !IMAGE_EXTS.has(ext)) return this.notFound(res);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return this.notFound(res);
    res.writeHead(200, {
      ...headers,
      'Content-Type': CONTENT_TYPES[ext]!,
      'Content-Length': info.size,
      ...(ext === '.svg' ? svgHeaders : { 'Cache-Control': svgHeaders['Cache-Control'] }),
    });
    createReadStream(file).pipe(res);
  }

  private async serveStatic(
    res: ServerResponse,
    path: string,
    req: IncomingMessage,
    headers: Record<string, string>,
  ): Promise<void> {
    const root = resolve(this.opts.webDir);
    const relative = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) return this.notFound(res);
    const info = await stat(file).catch(() => null);
    const ext = extname(file).toLowerCase();
    if (!info?.isFile() || !CONTENT_TYPES[ext]) return this.notFound(res);
    const html = ext === '.html';
    const host = req.headers.host ?? '';
    res.writeHead(200, {
      ...headers,
      'Content-Type': CONTENT_TYPES[ext]!,
      'Content-Length': info.size,
      'Cache-Control': html ? 'no-store' : 'private, max-age=31536000, immutable',
      ...(html
        ? {
            'Content-Security-Policy': [
              "default-src 'self'",
              "img-src 'self' data: blob:",
              "style-src 'self' 'unsafe-inline'",
              `connect-src 'self' ws://${host}`,
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'none'",
              "frame-ancestors 'none'",
            ].join('; '),
          }
        : {}),
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  }
}
