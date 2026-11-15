import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import {
  hostAllowed,
  isPrivateAddress,
  portsToTry,
  tableUrl,
  viewFor,
  visibleTokenIds,
  type Claim,
} from '@trifold/rules';
import type {
  ClientMessage,
  ServerMessage,
  TableReleaseTarget,
  TableSnapshot,
  TableStatus,
} from '@trifold/api';
import type { PlayerDevice } from '@trifold/schema';
import type { AppConfigStore } from '../appConfig';
import type { IconResources } from '../icons';
import type { LibrarySession } from '../library/session';
import { errorMessage, type Logger } from '../log';
import { resolveMediaPath } from '../media';
import { lanAddresses, listenOnFirstFreePort, type BoundListener, type LanAddress } from './listen';
import { MdnsResponder } from './mdns';
import { PlayersStore } from './players';

/** Client messages, checked before anything reads them (CLAUDE.md: validate every intent). */
const ClientMessageSchema: z.ZodType<ClientMessage> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), token: z.string().min(1).max(64).optional() }),
  z.object({
    type: z.literal('claim'),
    creatureKind: z.enum(['pc', 'npc']),
    creatureId: z.string().min(1).max(64),
    label: z.string().max(40).optional(),
  }),
]);

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
}

export interface TableHubOptions {
  config: AppConfigStore;
  session: LibrarySession;
  logger: Logger;
  icons: IconResources;
  /** The built player client (`out/web`). */
  webDir: string;
  onStatus(status: TableStatus): void;
  /** Tests replace the network lookups. */
  addresses?: () => LanAddress[];
  mdns?: { start(): Promise<string>; announce(): void; stop(): Promise<void> } | null;
  /** Ports to try instead of the saved one and 80, 8130–8139 (the smoke test's own port). */
  ports?: number[];
}

/**
 * The table server (ADR 0043, docs/PLAYER-CONNECTOR.md Phase 1): off until the DM starts it,
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
  private mapImage: { sceneId: string; fogKey: string; jpeg: Buffer } | null = null;
  private localName: string | null = null;
  private mdns: TableHubOptions['mdns'];
  private anyConnected = false;
  private startedAt: string | null = null;
  private error: string | null = null;
  private timers: NodeJS.Timeout[] = [];
  private broadcastTimer: NodeJS.Timeout | null = null;

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
      anyConnected: this.anyConnected,
      startedAt: this.startedAt,
      error: this.error,
    };
  }

  private emit(): void {
    this.opts.onStatus(this.status());
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
    if (this.mdns === undefined) this.mdns = new MdnsResponder(() => this.addresses);
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
    this.snapshot = null;
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
    if (await this.players.release(target)) {
      const what = target === 'all' ? 'every claim' : `${target.kind} ${target.id}`;
      this.opts.logger.info(`table server: DM released ${what}`);
      this.scheduleBroadcast();
    }
    this.emit();
    return this.status();
  }

  push(snapshot: TableSnapshot): void {
    if (this.state !== 'on' || snapshot.campaignId !== this.campaignId) return;
    const namesChanged =
      JSON.stringify(this.snapshot?.creatures.map((c) => c.name)) !==
      JSON.stringify(snapshot.creatures.map((c) => c.name));
    this.snapshot = snapshot;
    this.scheduleBroadcast();
    if (namesChanged) this.emit();
  }

  setMapImage(sceneId: string, fogKey: string, jpeg: Uint8Array): void {
    if (this.state !== 'on') return;
    this.mapImage = { sceneId, fogKey, jpeg: Buffer.from(jpeg) };
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
    const client: Client = { socket, deviceId: null, alive: true, last: '' };
    this.clients.add(client);
    this.anyConnected = true;
    socket.on('pong', () => (client.alive = true));
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      void this.receive(client, String(data));
    });
    socket.on('close', () => {
      this.clients.delete(client);
      if (client.deviceId) this.players?.touch(client.deviceId);
      this.emit();
    });
    socket.on('error', () => undefined);
    if (this.campaignId) {
      this.send(client, {
        type: 'campaign',
        campaignId: this.campaignId,
        campaignName: this.snapshot?.campaignName ?? '',
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
      this.emit();
      return;
    }
    // claim
    const creature = this.snapshot?.creatures.find(
      (c) => c.kind === msg.creatureKind && c.id === msg.creatureId,
    );
    if (!creature || !creature.claimable) {
      return this.reject(client, 'That character can’t be picked right now.');
    }
    if (players.claimOf(msg.creatureKind, msg.creatureId)) {
      return this.reject(client, `${creature.name} is in use on another device.`);
    }
    const existing: PlayerDevice | null = client.deviceId
      ? (players.devices.find((d) => d.deviceId === client.deviceId) ?? null)
      : null;
    try {
      const { device, token } = await players.claim(
        msg.creatureKind,
        msg.creatureId,
        existing,
        msg.label ?? '',
      );
      client.deviceId = device.deviceId;
      if (token && this.campaignId) {
        this.send(client, { type: 'token', token, campaignId: this.campaignId });
      }
      this.opts.logger.info(
        `table server: ${device.label || device.deviceId} claimed ${creature.kind} ${creature.id}`,
      );
    } catch (err) {
      this.opts.logger.warn(`table server: claim failed: ${errorMessage(err)}`);
      return this.reject(client, 'Could not save that. Try again.');
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
      this.mapImage.fogKey === scene.fogKey
    );
  }

  private sendState(client: Client): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const view = viewFor(snapshot, this.claimList(), client.deviceId, this.hasImageFor(snapshot));
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
        if (!img || img.sceneId !== map[1] || img.fogKey !== map[2]) return this.notFound(res);
        res.writeHead(200, {
          ...common,
          'Content-Type': 'image/jpeg',
          'Content-Length': img.jpeg.length,
          'Cache-Control': 'private, max-age=86400, immutable',
        });
        res.end(req.method === 'HEAD' ? undefined : img.jpeg);
        return;
      }
      const tokenArt = /^\/t\/([^/]+)\/(art|glyph)$/.exec(path);
      if (tokenArt)
        return await this.serveTokenArt(res, tokenArt[1]!, tokenArt[2] as 'art' | 'glyph', common);
      const portrait = /^\/c\/(pc|npc)\/([^/]+)\/portrait$/.exec(path);
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
    const file = src ? resolveMediaPath(src, this.opts.session, this.opts.icons) : null;
    const ext = file ? extname(file).toLowerCase() : '';
    if (!file || !IMAGE_EXTS.has(ext)) return this.notFound(res);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return this.notFound(res);
    res.writeHead(200, {
      ...headers,
      'Content-Type': CONTENT_TYPES[ext]!,
      'Content-Length': info.size,
      'Cache-Control': 'private, max-age=86400',
      ...(ext === '.svg'
        ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }
        : {}),
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
