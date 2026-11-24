import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ClientView, ServerMessage } from '@trifold/api';
import {
  createWebSocketClient,
  useConnection,
  type TableClient,
  type TableClientHandlers,
} from './connection';

const view: ClientView = {
  campaignName: 'Greyford',
  live: true,
  mine: [],
  picker: [],
  map: null,
  reclaimMode: 'open',
};

/** A transport the test drives by hand. */
function fakeClient() {
  let handlers: TableClientHandlers | null = null;
  const sent: ClientMessage[] = [];
  const stop = vi.fn();
  const client: TableClient = {
    start(h) {
      handlers = h;
      return stop;
    },
    send: (msg) => void sent.push(msg),
  };
  return {
    client,
    sent,
    stop,
    link: (link: Parameters<TableClientHandlers['onLink']>[0]) => act(() => handlers!.onLink(link)),
    message: (msg: ServerMessage) => act(() => handlers!.onMessage(msg)),
  };
}

describe('useConnection', () => {
  it('shows what any transport delivers and sends through it', () => {
    const fake = fakeClient();
    const { result, unmount } = renderHook(() => useConnection(fake.client));
    expect(result.current.link).toBe('connecting');

    fake.link('open');
    fake.message({ type: 'state', ...view });
    expect(result.current.link).toBe('open');
    expect(result.current.view).toEqual(view);

    fake.message({ type: 'waiting', creatureName: 'Brannoc' });
    expect(result.current.waiting).toBe('Brannoc');
    fake.message({ type: 'error', message: 'The DM kept Brannoc where it is.' });
    expect(result.current.waiting).toBeNull();
    expect(result.current.error).toBe('The DM kept Brannoc where it is.');

    fake.message({ type: 'dragEnded', tokenId: 't1', reason: 'Movement locked by the DM.' });
    fake.message({ type: 'dragEnded', tokenId: 't1', reason: 'Movement locked by the DM.' });
    expect(result.current.dragEnded).toEqual({ tokenId: 't1', n: 2 });

    fake.message({ type: 'closed' });
    expect(result.current.link).toBe('stopped');

    result.current.send({ type: 'switch' });
    expect(fake.sent).toEqual([{ type: 'switch' }]);

    unmount();
    expect(fake.stop).toHaveBeenCalledOnce();
  });
});

describe('createWebSocketClient', () => {
  class FakeSocket {
    static OPEN = 1;
    static last: FakeSocket | null = null;
    readyState = 1;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(public url: string) {
      FakeSocket.last = this;
    }
    send(text: string) {
      this.sent.push(text);
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    receive(msg: ServerMessage) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
  }

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers the campaign with its stored token, keeps a new one, and passes every message on', () => {
    const client = createWebSocketClient();
    const links: string[] = [];
    const messages: ServerMessage[] = [];
    const stop = client.start({
      onLink: (l) => links.push(l),
      onMessage: (m) => messages.push(m),
    });
    const socket = FakeSocket.last!;
    expect(socket.url).toBe(`ws://${location.host}/ws`);
    socket.onopen?.();
    expect(links).toEqual(['open']);

    socket.receive({ type: 'campaign', campaignId: 'c1', campaignName: 'Greyford', now: 1 });
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: 'hello' });

    socket.receive({ type: 'token', token: 'secret', campaignId: 'c1' });
    expect(localStorage.getItem('trifold:c1')).toBe('secret');
    socket.receive({ type: 'campaign', campaignId: 'c1', campaignName: 'Greyford', now: 2 });
    expect(JSON.parse(socket.sent[1]!)).toEqual({ type: 'hello', token: 'secret' });

    client.send({ type: 'undo' });
    expect(JSON.parse(socket.sent[2]!)).toEqual({ type: 'undo' });
    expect(messages.map((m) => m.type)).toEqual(['campaign', 'token', 'campaign']);

    // Closing for good does not report a lost link or try again.
    stop();
    expect(links).toEqual(['open']);
  });

  it('reports a dropped link as reconnecting, and as stopped once the DM closed the table', () => {
    const client = createWebSocketClient();
    const links: string[] = [];
    const stop = client.start({ onLink: (l) => links.push(l), onMessage: () => undefined });
    FakeSocket.last!.onclose?.();
    expect(links).toEqual(['reconnecting']);
    stop();

    const again = createWebSocketClient();
    const stopAgain = again.start({ onLink: (l) => links.push(l), onMessage: () => undefined });
    FakeSocket.last!.receive({ type: 'closed' });
    FakeSocket.last!.onclose?.();
    expect(links).toEqual(['reconnecting', 'stopped']);
    stopAgain();
  });
});
