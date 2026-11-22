import { WebSocket } from 'ws';
import { isPrivateAddress, tableUrl } from '@trifold/rules';
import type { ClientMessage, ServerMessage } from '@trifold/api';

/**
 * A player's Trifold as a device at a GM's table (docs/PLAYER-MODE.md, "Connection"): one
 * WebSocket to the table server on the local network, speaking exactly what the phone page
 * speaks (docs/PLAYER-CONNECTOR.md, "Transport"). The server needs no change for it: the socket
 * names the table's own address as its origin, as the table's page would.
 *
 * It connects only to a private address, and only while it is started, which the app does only
 * while the player has a joined campaign open (CLAUDE.md ground rule 1).
 */

/** A table's address in parts. `host` is an IP address or a `.local` name, without brackets. */
export interface TableEndpoint {
  host: string;
  port: number;
}

/**
 * Reads an address as a GM's Trifold shows it or as `joined.json` keeps it: `trifold.local`,
 * `192.168.1.23:8130`, `http://192.168.1.23:8130/`, `[fd00::23]:8130`. No port means 80. Null
 * for anything that is not a private address or a `.local` name: Trifold joins tables on the
 * local network and nothing else.
 */
export function parseTableAddress(input: string): TableEndpoint | null {
  const text = input
    .trim()
    .replace(/^(https?|wss?):\/\//i, '')
    .replace(/\/.*$/, '');
  const m =
    /^\[([0-9A-Fa-f:.]+)\](?::(\d{1,5}))?$/.exec(text) ??
    /^([0-9A-Za-z.-]{1,253})(?::(\d{1,5}))?$/.exec(text);
  if (!m) return null;
  const host = m[1]!.toLowerCase();
  const port = m[2] ? Number(m[2]) : 80;
  if (!(port >= 1 && port <= 65535)) return null;
  const local = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.local$/.test(host);
  if (!local && !isPrivateAddress(host)) return null;
  return { host, port };
}

/** An endpoint as `joined.json` keeps it (`TableAddress` in the schema). */
export function formatTableAddress({ host, port }: TableEndpoint): string {
  return `${host.includes(':') ? `[${host}]` : host}:${port}`;
}

/**
 * The link as the player console shows it. The first four are the phone page's; the last two
 * are a table that is up with another campaign, and an address that is not one to connect to.
 */
export type LanLink =
  'connecting' | 'open' | 'reconnecting' | 'stopped' | 'otherCampaign' | 'refused';

/** The socket as the client uses it; tests hand in their own. */
export interface LanSocket {
  onOpen(listener: () => void): void;
  onMessage(listener: (text: string) => void): void;
  onClose(listener: () => void): void;
  send(text: string): void;
  close(): void;
  /** The address the socket is connected to, once open. */
  remoteAddress(): string | undefined;
}

/** Messages are views of a table, not files: anything larger than this is not one. */
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const HANDSHAKE_MS = 5000;

function openSocket(url: string, origin: string): LanSocket {
  const ws = new WebSocket(url, {
    origin,
    handshakeTimeout: HANDSHAKE_MS,
    maxPayload: MAX_MESSAGE_BYTES,
    followRedirects: false,
  });
  // A refused or dropped connection ends in `close`; the error itself needs no handling.
  ws.on('error', () => undefined);
  return {
    onOpen: (listener) => void ws.on('open', listener),
    onMessage: (listener) =>
      void ws.on('message', (data, isBinary) => {
        if (!isBinary) listener(String(data));
      }),
    onClose: (listener) => void ws.on('close', listener),
    send: (text) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    },
    close: () => ws.terminate(),
    remoteAddress: () =>
      (ws as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress,
  };
}

export interface LanClientOptions {
  endpoint: TableEndpoint;
  /** The campaign this connection is for; a table up with another one is not joined. */
  campaignId: string;
  /** The device token this Library holds for the campaign, if it has claimed before. */
  token?: string;
  onLink(link: LanLink): void;
  /** Every server message, the token included, as the phone page's hook receives them. */
  onMessage(msg: ServerMessage): void;
  /** A new device token, to keep: the claim. */
  onToken(token: string): void;
  /** The table answered and it is this campaign's; its name as the GM has it now. */
  onCampaign?(campaignName: string): void;
  open?: (url: string, origin: string) => LanSocket;
  /** Tests replace the timers' clock. */
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export class LanClient {
  private socket: LanSocket | null = null;
  private timer: unknown = null;
  private started = false;
  private attempt = 0;
  private token: string | undefined;
  /** The table said it is closed, or is up with another campaign: ask again slowly. */
  private waiting: 'stopped' | 'otherCampaign' | null = null;
  private ready = false;

  constructor(private readonly opts: LanClientOptions) {
    this.token = opts.token;
  }

  /** Opens the link and keeps it open, retrying with backoff, until `stop`. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  /** Closes the link for good. */
  stop(): void {
    this.started = false;
    (this.opts.clearTimer ?? clearTimeout)(this.timer as NodeJS.Timeout);
    this.timer = null;
    this.ready = false;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  /** Sends a request; dropped until the table has named this campaign and been greeted. */
  send(msg: ClientMessage): void {
    if (this.ready) this.socket?.send(JSON.stringify(msg));
  }

  private connect(): void {
    const { endpoint } = this.opts;
    const origin = tableUrl(endpoint.host, endpoint.port);
    const socket = (this.opts.open ?? openSocket)(`${origin.replace(/^http/, 'ws')}/ws`, origin);
    this.socket = socket;
    this.ready = false;
    socket.onOpen(() => {
      if (this.socket !== socket) return;
      // A `.local` name is resolved by the system: hold it to the same rule as a typed address.
      const remote = socket.remoteAddress();
      if (remote !== undefined && !isPrivateAddress(remote)) {
        this.opts.onLink('refused');
        this.stop();
        return;
      }
      this.attempt = 0;
    });
    socket.onMessage((text) => {
      if (this.socket !== socket) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(text) as ServerMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      if (msg.type === 'campaign') {
        if (msg.campaignId !== this.opts.campaignId) {
          // The GM's table is up with another campaign: say nothing to it, and look again later.
          this.waiting = 'otherCampaign';
          socket.close();
          return;
        }
        this.waiting = null;
        this.ready = true;
        socket.send(
          JSON.stringify({ type: 'hello', ...(this.token ? { token: this.token } : {}) }),
        );
        this.opts.onLink('open');
        this.opts.onCampaign?.(msg.campaignName);
      } else if (!this.ready) {
        return;
      } else if (msg.type === 'token') {
        if (msg.campaignId !== this.opts.campaignId) return;
        this.token = msg.token;
        this.opts.onToken(msg.token);
      } else if (msg.type === 'closed') {
        this.waiting = 'stopped';
      }
      this.opts.onMessage(msg);
    });
    socket.onClose(() => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ready = false;
      if (!this.started) return;
      this.opts.onLink(this.waiting ?? 'reconnecting');
      this.attempt += 1;
      const delay = this.waiting ? 5000 : Math.min(5000, 500 * 2 ** Math.min(this.attempt, 4));
      this.timer = (this.opts.setTimer ?? setTimeout)(() => this.connect(), delay);
    });
  }
}
