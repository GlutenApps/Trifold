import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientView, ServerMessage } from '@trifold/api';
import { createBridgeClient, withTableUrls } from './bridgeClient';

const view: ClientView = {
  campaignName: 'Greyford',
  live: true,
  reclaimMode: 'open',
  mine: [
    {
      kind: 'pc',
      id: 'p1',
      name: 'Brannoc',
      portraitUrl: '/c/pc/p1/portrait?v=1',
      hp: null,
      ac: null,
      conditions: [],
      inFight: false,
      needsInitiative: false,
      editable: { hp: true, maxHp: true, ac: true, conditions: true },
      movementLocked: false,
    },
  ],
  picker: [
    { kind: 'pc', id: 'p2', name: 'Wren', inUse: false, holderOnline: false },
    {
      kind: 'pc',
      id: 'p3',
      name: 'Tamsin',
      portraitUrl: 'https://example.com/x.png',
      inUse: false,
      holderOnline: false,
    },
  ],
  map: {
    id: 's1',
    title: 'Inn',
    width: 100,
    height: 100,
    backdrop: 'dark',
    hasImage: true,
    imageUrl: '/map/s1/k.jpg',
    grid: { cellPx: 10, offsetX: 0, offsetY: 0, color: '#000', opacity: 0.3, visible: true },
    fog: null,
    tokenStyle: 'engraved',
    tokens: [
      {
        id: 't1',
        kind: 'pc',
        x: 0,
        y: 0,
        footprint: 1,
        label: 'B',
        role: 'ally',
        dead: false,
        mine: true,
        artUrl: '/t/t1/art?v=9',
        glyphUrl: '//example.com/evil.svg',
      },
    ],
  },
};

describe('withTableUrls', () => {
  it('points a table’s pictures at main, by campaign', () => {
    const out = withTableUrls(view, 'c 1');
    expect(out.map?.imageUrl).toBe('trifold-media://table/c%201/map/s1/k.jpg');
    expect(out.map?.tokens[0]?.artUrl).toBe('trifold-media://table/c%201/t/t1/art?v=9');
    expect(out.mine[0]?.portraitUrl).toBe('trifold-media://table/c%201/c/pc/p1/portrait?v=1');
    expect(out.picker[0]).not.toHaveProperty('portraitUrl');
  });

  it('drops an address that is not one of the table’s own paths, so nothing else is loaded', () => {
    const out = withTableUrls(view, 'c1');
    expect(out.picker[1]).not.toHaveProperty('portraitUrl');
    expect(out.map?.tokens[0]).not.toHaveProperty('glyphUrl');
    expect(JSON.stringify(out)).not.toContain('example.com');
  });
});

describe('createBridgeClient', () => {
  const listeners = new Map<string, (payload: never) => void>();
  beforeEach(() => {
    listeners.clear();
    window.trifold.on = vi.fn((event: string, listener: (payload: never) => void) => {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    }) as never;
  });

  it('opens the campaign through main, passes on its own table’s messages, and closes', () => {
    const links: string[] = [];
    const got: ServerMessage[] = [];
    const client = createBridgeClient('c1');
    const stop = client.start({ onLink: (l) => links.push(l), onMessage: (m) => got.push(m) });
    expect(window.trifold.joined.open).toHaveBeenCalledWith('c1');
    expect(links).toEqual(['connecting']);

    const link = listeners.get('joinedLink') as (e: object) => void;
    const message = listeners.get('joinedMessage') as (e: object) => void;
    link({ campaignId: 'c1', link: 'open' });
    link({ campaignId: 'other', link: 'stopped' });
    message({ campaignId: 'c1', message: { type: 'state', ...view } });
    message({ campaignId: 'other', message: { type: 'closed' } });
    expect(links).toEqual(['connecting', 'open']);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      type: 'state',
      map: { imageUrl: 'trifold-media://table/c1/map/s1/k.jpg' },
    });

    client.send({ type: 'switch' });
    expect(window.trifold.joined.send).toHaveBeenCalledWith('c1', { type: 'switch' });

    stop();
    expect(window.trifold.joined.close).toHaveBeenCalledWith('c1');
    expect(listeners.size).toBe(0);
  });
});
