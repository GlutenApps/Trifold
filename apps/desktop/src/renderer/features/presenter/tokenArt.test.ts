import { describe, expect, it } from 'vitest';
import type { EntityRef } from '@trifold/schema';
import { resolveTokenArt, type ArtSources } from './tokenArt';

/** Which picture a token shows (ADR 0033). */
const sources: ArtSources = {
  slug: 'keep',
  pcs: [{ id: 'pc1', portrait: 'tokens/thora.png' }, { id: 'pc2' }],
  npcs: [
    { id: 'n1', portrait: 'tokens/vex.png' },
    {
      id: 'n2',
      recordRef: { recordId: 'r', sourceId: 'srd', key: 'bandit captain', edition: '2024' },
    },
    { id: 'n3' },
  ],
  creature: (key) => (key === 'goblin' || key === 'bandit captain' ? `art:${key}` : undefined),
};
const record = (key: string): EntityRef => ({
  kind: 'record',
  ref: { recordId: 'x', sourceId: 'srd', key, edition: '2024' },
  name: key,
});
const url = (path: string) => `trifold-media://library/campaigns/keep/${path}`;

describe('token art', () => {
  it('shows the token’s own art first, whatever it is', () => {
    expect(resolveTokenArt({ art: 'tokens/own.png', ref: record('goblin') }, sources)).toBe(
      url('tokens/own.png'),
    );
  });

  it('shows a PC’s or NPC’s portrait, and an NPC without one its stat block’s art', () => {
    expect(resolveTokenArt({ ref: { kind: 'pc', pcId: 'pc1', name: 'Thora' } }, sources)).toBe(
      url('tokens/thora.png'),
    );
    expect(
      resolveTokenArt({ ref: { kind: 'pc', pcId: 'pc2', name: 'Zed' } }, sources),
    ).toBeUndefined();
    expect(resolveTokenArt({ ref: { kind: 'npc', npcId: 'n1', name: 'Vex' } }, sources)).toBe(
      url('tokens/vex.png'),
    );
    expect(resolveTokenArt({ ref: { kind: 'npc', npcId: 'n2', name: 'Mara' } }, sources)).toBe(
      'art:bandit captain',
    );
    expect(
      resolveTokenArt({ ref: { kind: 'npc', npcId: 'n3', name: 'Pell' } }, sources),
    ).toBeUndefined();
  });

  it('shows nothing on a token whose art was removed, though its creature keeps a picture', () => {
    expect(resolveTokenArt({ art: '', ref: record('goblin') }, sources)).toBeUndefined();
  });

  it('shows a compendium creature’s art by key, and nothing for a marker', () => {
    expect(resolveTokenArt({ ref: record('goblin') }, sources)).toBe('art:goblin');
    expect(resolveTokenArt({ ref: record('wolf') }, sources)).toBeUndefined();
    expect(resolveTokenArt({ ref: { kind: 'custom', name: 'Trap' } }, sources)).toBeUndefined();
  });
});
