import { useEffect, useState } from 'react';
import type { ClientMessage, ClientView, PlayerLink, ServerMessage } from '@trifold/api';
import { syncClock } from './clock';

/**
 * A device's link to the DM's Trifold (docs/PLAYER-CONNECTOR.md, "Transport"). `TableClient` is
 * the transport: how messages travel and how the device says who it is. `useConnection` is what
 * a page makes of the messages, the same for every transport. Phones use the WebSocket client
 * below; the player console (docs/PLAYER-MODE.md) brings its own, through main.
 */

/**
 * The link's state. The last two are the player console's alone (docs/PLAYER-MODE.md): a table
 * that is up with another campaign, and an address that is not one to connect to.
 */
export type Link = PlayerLink;

export interface TableClientHandlers {
  onLink(link: Link): void;
  onMessage(msg: ServerMessage): void;
}

export interface TableClient {
  /**
   * Opens the link and keeps it open, retrying for as long as it is wanted. Identifying the
   * device (the token) is the client's business; every server message still reaches
   * `onMessage`. Returns what closes the link for good.
   */
  start(handlers: TableClientHandlers): () => void;
  /** Sends a request; dropped while the link is down. */
  send(msg: ClientMessage): void;
}

const tokenKey = (campaignId: string) => `trifold:${campaignId}`;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing: the claim still works until the page closes.
  }
}

export function readLabel(): string {
  return readStorage('trifold:label') ?? '';
}

export function saveLabel(label: string): void {
  writeStorage('trifold:label', label);
}

/**
 * The browser's one WebSocket to the server that served the page. The device token is kept in
 * localStorage under the campaign's id; on connect the server names the campaign and the page
 * answers with the token it holds for it, so a returning player lands on their creatures. A
 * dropped connection retries with backoff for as long as the page is open.
 */
export function createWebSocketClient(): TableClient {
  let socket: WebSocket | null = null;
  return {
    start({ onLink, onMessage }) {
      let closed = false;
      let attempt = 0;
      let timer: number | undefined;
      let stopped = false;

      const connect = () => {
        const ws = new WebSocket(`ws://${location.host}/ws`);
        socket = ws;
        ws.onopen = () => {
          attempt = 0;
          stopped = false;
          onLink('open');
        };
        ws.onmessage = (event) => {
          let msg: ServerMessage;
          try {
            msg = JSON.parse(String(event.data)) as ServerMessage;
          } catch {
            return;
          }
          if (msg.type === 'campaign') {
            const token = readStorage(tokenKey(msg.campaignId));
            ws.send(JSON.stringify({ type: 'hello', ...(token ? { token } : {}) }));
          } else if (msg.type === 'token') {
            writeStorage(tokenKey(msg.campaignId), msg.token);
          } else if (msg.type === 'closed') {
            stopped = true;
          }
          onMessage(msg);
        };
        ws.onclose = () => {
          if (socket === ws) socket = null;
          if (closed) return;
          onLink(stopped ? 'stopped' : 'reconnecting');
          attempt += 1;
          const delay = stopped ? 5000 : Math.min(5000, 500 * 2 ** Math.min(attempt, 4));
          timer = window.setTimeout(connect, delay);
        };
      };
      connect();
      return () => {
        closed = true;
        window.clearTimeout(timer);
        socket?.close();
      };
    },
    send(msg) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    },
  };
}

export interface Connection {
  link: Link;
  view: ClientView | null;
  error: string | null;
  clearError(): void;
  /** Approval mode: the character the DM has been asked for. */
  waiting: string | null;
  /** Switch character: what was released and until when Undo works. */
  released: { names: string[]; until: number } | null;
  clearReleased(): void;
  /** The last drag that ended without a move (refused, lapsed, or taken by the DM). */
  dragEnded: { tokenId: string; n: number } | null;
  send(msg: ClientMessage): void;
}

/** What a page shows of one client's link. `client` must stay the same object between renders. */
export function useConnection(client: TableClient): Connection {
  const [link, setLink] = useState<Link>('connecting');
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [released, setReleased] = useState<Connection['released']>(null);
  const [dragEnded, setDragEnded] = useState<Connection['dragEnded']>(null);

  useEffect(
    () =>
      client.start({
        onLink: setLink,
        onMessage: (msg) => {
          switch (msg.type) {
            case 'campaign':
              syncClock(msg.now);
              break;
            case 'token':
              break;
            case 'state': {
              const { type: _type, ...next } = msg;
              setView(next);
              if (next.mine.length) setWaiting(null);
              break;
            }
            case 'error':
              setError(msg.message);
              setWaiting(null);
              break;
            case 'waiting':
              setWaiting(msg.creatureName);
              break;
            case 'released':
              setReleased({ names: msg.names, until: Date.now() + msg.undoMs });
              break;
            case 'grabbed':
              break;
            case 'dragEnded':
              setError(msg.reason);
              setDragEnded((d) => ({ tokenId: msg.tokenId, n: (d?.n ?? 0) + 1 }));
              break;
            case 'closed':
              setLink('stopped');
              break;
          }
        },
      }),
    [client],
  );

  return {
    link,
    view,
    error,
    clearError: () => setError(null),
    waiting,
    released,
    clearReleased: () => setReleased(null),
    dragEnded,
    send: (msg) => client.send(msg),
  };
}
