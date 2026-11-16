import { useEffect, useRef, useState } from 'react';
import type { ClientMessage, ClientView, ServerMessage } from '@trifold/api';
import { syncClock } from './clock';

/**
 * The browser's one WebSocket to the DM's Trifold (docs/PLAYER-CONNECTOR.md, "Transport"). The
 * device token is kept in localStorage under the campaign's id; on connect the server names the
 * campaign and the page answers with the token it holds for it, so a returning player lands on
 * their creatures. A dropped connection retries with backoff for as long as the page is open.
 */

export type Link = 'connecting' | 'open' | 'reconnecting' | 'stopped';

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

export function useConnection(): Connection {
  const [link, setLink] = useState<Link>('connecting');
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [released, setReleased] = useState<Connection['released']>(null);
  const [dragEnded, setDragEnded] = useState<Connection['dragEnded']>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let timer: number | undefined;
    let stopped = false;

    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        stopped = false;
        setLink('open');
      };
      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        switch (msg.type) {
          case 'campaign': {
            syncClock(msg.now);
            const token = readStorage(tokenKey(msg.campaignId));
            ws.send(JSON.stringify({ type: 'hello', ...(token ? { token } : {}) }));
            break;
          }
          case 'token':
            writeStorage(tokenKey(msg.campaignId), msg.token);
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
            stopped = true;
            setLink('stopped');
            break;
        }
      };
      ws.onclose = () => {
        socket.current = null;
        if (closed) return;
        setLink(stopped ? 'stopped' : 'reconnecting');
        attempt += 1;
        const delay = stopped ? 5000 : Math.min(5000, 500 * 2 ** Math.min(attempt, 4));
        timer = window.setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket.current?.close();
    };
  }, []);

  return {
    link,
    view,
    error,
    clearError: () => setError(null),
    waiting,
    released,
    clearReleased: () => setReleased(null),
    dragEnded,
    send: (msg) => {
      const ws = socket.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}
