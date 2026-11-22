import { describe, expect, it } from 'vitest';
import { mapImageKey } from './view';
import { isClaimable } from './claimable';
import { hostAllowed, isPrivateAddress, portsToTry, TABLE_PORTS, tableUrl } from './network';
import type { Claim, TableSnapshot, TableToken } from './types';
import { visibleTokenIds, viewFor } from './view';

const stats = {
  inFight: false,
  needsInitiative: false,
  editable: { hp: true, maxHp: true, ac: true, conditions: false },
};

const grid = { cellPx: 10, offsetX: 0, offsetY: 0, color: '#000', opacity: 0.3, visible: true };

const token = (id: string, x: number, extra: Partial<TableToken> = {}): TableToken => ({
  id,
  kind: 'creature',
  x,
  y: 0,
  footprint: 1,
  label: id,
  role: 'enemy',
  hidden: false,
  dead: false,
  ...extra,
});

/** A 100 × 10 map with the left half (x < 50) revealed. */
function snapshot(tokens: TableToken[], fogOn = true): TableSnapshot {
  const fog = fogOn
    ? {
        enabled: true as const,
        shapes: [{ mode: 'reveal' as const, kind: 'rect' as const, x: 0, y: 0, w: 50, h: 10 }],
      }
    : null;
  return {
    campaignId: 'c1',
    campaignName: 'The Lantern at Greyford',
    scene: {
      id: 's1',
      title: 'Bridge',
      width: 100,
      height: 10,
      backdrop: 'dark',
      hasImage: true,
      grid,
      fog,
      imageKey: mapImageKey(fog, 'maps/a.webp'),
      tokenStyle: 'engraved',
      tokens,
    },
    creatures: [
      {
        kind: 'pc',
        id: 'brannoc',
        name: 'Brannoc Hale',
        portraitSrc: 'trifold-media://library/campaigns/g/portraits/b.png',
        claimable: true,
        ...stats,
        hp: { current: 20, max: 24, temp: 0 },
        ac: 16,
        conditions: [{ id: 'c1', name: 'Prone' }],
      },
      {
        kind: 'pc',
        id: 'wren',
        name: 'Wren Ashby',
        claimable: true,
        ...stats,
        hp: { current: 9, max: 9, temp: 0 },
        ac: 13,
        conditions: [],
      },
      {
        kind: 'npc',
        id: 'gorm',
        name: 'Gorm Tallow',
        claimable: false,
        ...stats,
        hp: null,
        ac: null,
        conditions: [],
      },
    ],
  };
}

const brannocToken = (x: number) =>
  token('tb', x, { kind: 'pc', role: 'ally', creature: { kind: 'pc', id: 'brannoc' } });
const claims: Claim[] = [{ creatureKind: 'pc', creatureId: 'brannoc', deviceId: 'd1' }];

describe('isClaimable', () => {
  it('needs the flag', () => {
    expect(isClaimable('pc', false, [])).toBe(false);
    expect(isClaimable('npc', false, ['ally'])).toBe(false);
  });
  it('offers a flagged PC whatever its role', () => {
    expect(isClaimable('pc', true, ['enemy'])).toBe(true);
  });
  it('offers a flagged NPC unless a token or combatant is an enemy', () => {
    expect(isClaimable('npc', true, [])).toBe(true);
    expect(isClaimable('npc', true, ['neutral', 'ally'])).toBe(true);
    expect(isClaimable('npc', true, ['ally', 'enemy'])).toBe(false);
  });
});

describe('viewFor', () => {
  it('tells a device its own creature’s turn, and nobody else’s', () => {
    const snap = snapshot([brannocToken(1)]);
    snap.creatures[0]!.turn = 'next';
    snap.creatures[1]!.turn = 'now';
    const mine = viewFor(snap, claims, 'd1', true);
    expect(mine.mine.map((c) => [c.id, c.turn])).toEqual([['brannoc', 'next']]);
    // Wren acts now, on another device or nobody's: this device is not told.
    expect(JSON.stringify(mine)).not.toContain('"now"');
    // The picker says nothing about turns either.
    expect(JSON.stringify(viewFor(snap, claims, 'd2', true))).not.toContain('"turn"');
  });

  it('shows a device with no claims the picker, never the map or stats', () => {
    const view = viewFor(snapshot([brannocToken(1)]), claims, 'd2', true);
    expect(view.map).toBeNull();
    expect(view.mine).toEqual([]);
    expect(view.picker.map((p) => [p.id, p.inUse])).toEqual([
      ['brannoc', true],
      ['wren', false],
    ]);
    expect(JSON.stringify(view)).not.toContain('Gorm');
    expect(JSON.stringify(view)).not.toContain('portraits/b.png');
  });

  it('gives the owner its creature in full and its token', () => {
    const view = viewFor(snapshot([brannocToken(1)]), claims, 'd1', true);
    expect(view.picker).toEqual([]);
    expect(view.mine).toHaveLength(1);
    expect(view.mine[0]).toMatchObject({
      id: 'brannoc',
      hp: { current: 20 },
      ac: 16,
      tokenId: 'tb',
    });
    expect(view.mine[0]!.portraitUrl).toMatch(/^\/c\/pc\/brannoc\/portrait\?v=/);
    expect(view.map?.tokens[0]).toMatchObject({ id: 'tb', mine: true });
  });

  it('never sends a token under fog or a hidden one to another device', () => {
    const snap = snapshot([
      brannocToken(1),
      token('seen', 2),
      token('fogged', 7, { label: 'Gorm Tallow' }),
      token('hidden', 3, { hidden: true, label: 'Ambusher' }),
    ]);
    const view = viewFor(snap, claims, 'd1', true);
    expect(view.map?.tokens.map((t) => t.id)).toEqual(['tb', 'seen']);
    const wire = JSON.stringify(view);
    expect(wire).not.toContain('fogged');
    expect(wire).not.toContain('Gorm');
    expect(wire).not.toContain('Ambusher');
  });

  it('lets the owner see its own token under fog, and nobody else', () => {
    const snap = snapshot([brannocToken(8)]);
    const own = viewFor(snap, claims, 'd1', true);
    expect(own.map?.tokens).toEqual([expect.objectContaining({ id: 'tb', fogged: true })]);
    const other: Claim[] = [...claims, { creatureKind: 'pc', creatureId: 'wren', deviceId: 'd2' }];
    expect(viewFor(snap, other, 'd2', true).map?.tokens).toEqual([]);
  });

  it('serves the fogged map image only once the server holds it', () => {
    const snap = snapshot([brannocToken(1)]);
    expect(viewFor(snap, claims, 'd1', false).map?.imageUrl).toBeUndefined();
    expect(viewFor(snap, claims, 'd1', true).map?.imageUrl).toBe(
      `/map/s1/${snap.scene!.imageKey}.jpg`,
    );
  });

  it('gives a new fog state a new image key', () => {
    expect(snapshot([], true).scene!.imageKey).not.toBe(snapshot([], false).scene!.imageKey);
  });

  it('shows the owner its stats with no map on the TV', () => {
    const snap = { ...snapshot([]), scene: null };
    const view = viewFor(snap, claims, 'd1', false);
    expect(view.map).toBeNull();
    expect(view.mine[0]?.name).toBe('Brannoc Hale');
  });

  it('treats a claim on a creature no longer in the snapshot as no claim', () => {
    const gone: Claim[] = [{ creatureKind: 'pc', creatureId: 'tamsin', deviceId: 'd1' }];
    expect(viewFor(snapshot([]), gone, 'd1', true).picker.length).toBe(2);
  });

  it('serves art only for tokens the device can see', () => {
    const snap = snapshot([brannocToken(1), token('fogged', 7), token('seen', 2)]);
    expect([...visibleTokenIds(snap, claims, 'd1')]).toEqual(['tb', 'seen']);
    expect([...visibleTokenIds(snap, claims, 'd2')]).toEqual([]);
  });
});

describe('network', () => {
  it('tries 80 then 8130–8139, or the saved port first and never 80 again', () => {
    expect(TABLE_PORTS).toEqual([80, 8130, 8131, 8132, 8133, 8134, 8135, 8136, 8137, 8138, 8139]);
    expect(portsToTry(null)).toEqual(TABLE_PORTS);
    expect(portsToTry(8131)).toEqual([8131, 8130, 8132, 8133, 8134, 8135, 8136, 8137, 8138, 8139]);
    expect(portsToTry(80)[0]).toBe(80);
    expect(portsToTry(80).filter((p) => p === 80)).toHaveLength(1);
  });

  it('accepts private LAN addresses only', () => {
    for (const ip of [
      '10.0.0.4',
      '172.16.1.1',
      '172.31.255.1',
      '192.168.1.23',
      '::ffff:192.168.1.2',
      'fe80::1%12',
      'fd12::3',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of [
      '8.8.8.8',
      '172.32.0.1',
      '127.0.0.1',
      '::1',
      '2001:db8::1',
      '::ffff:8.8.8.8',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('writes addresses with http:// and the port only when it is not 80', () => {
    expect(tableUrl('192.168.1.23', 80)).toBe('http://192.168.1.23');
    expect(tableUrl('trifold.local', 8130)).toBe('http://trifold.local:8130');
    expect(tableUrl('fe80::1%3', 8130)).toBe('http://[fe80::1]:8130');
  });

  it('checks the Host header against the addresses shown', () => {
    const hosts = ['192.168.1.23', 'trifold.local'];
    expect(hostAllowed('192.168.1.23', hosts, 80)).toBe(true);
    expect(hostAllowed('Trifold.local:8130', hosts, 8130)).toBe(true);
    expect(hostAllowed('trifold.local', hosts, 8130)).toBe(false);
    expect(hostAllowed('evil.example', hosts, 80)).toBe(false);
    expect(hostAllowed(undefined, hosts, 80)).toBe(false);
  });
});

describe('viewFor: screens', () => {
  it('gives an image scene by the server’s own path, never the file', () => {
    const snap = {
      ...snapshot([brannocToken(1)]),
      scene: null,
      screen: {
        kind: 'image' as const,
        id: 'i1',
        title: 'Greyford',
        src: 'trifold-media://library/campaigns/g/images/v.jpg',
        width: 10,
        height: 10,
      },
    };
    const view = viewFor(snap, claims, 'd1', false);
    expect(view.screen).toMatchObject({
      kind: 'image',
      imageUrl: expect.stringMatching(/^\/screen\/i1\/image\?v=/),
    });
    expect(JSON.stringify(view)).not.toContain('images/v.jpg');
  });
});
