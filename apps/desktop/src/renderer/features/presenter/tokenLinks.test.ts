import type { Combatant, Scene, Token } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import {
  autoLink,
  combatantCandidates,
  sameIdentity,
  sceneInPlay,
  tokenCandidates,
  turnOrderByToken,
} from './tokenLinks';

type Linkable = Pick<Combatant, 'id' | 'ref' | 'name' | 'tokenId' | 'isLair'>;

const goblinRef = {
  kind: 'record',
  ref: { recordId: 'r-goblin', sourceId: 'src', key: 'goblin', edition: '2024' },
  name: 'Goblin',
} as const;
const thora = { kind: 'pc', pcId: 'p1', name: 'Thora' } as const;

function token(id: string, extra: Partial<Token> = {}): Token {
  return {
    id,
    kind: 'creature',
    ref: { kind: 'custom', name: id },
    label: id,
    x: 0,
    y: 0,
    footprint: 1,
    role: 'enemy',
    hidden: false,
    nameMasked: true,
    dead: false,
    ...extra,
  };
}

function fighter(id: string, extra: Partial<Linkable> = {}): Linkable {
  return { id, name: id, ref: { kind: 'custom', name: id }, isLair: false, ...extra };
}

describe('sameIdentity', () => {
  it('matches on what both point at, never on a marker', () => {
    expect(sameIdentity(thora, token('t', { kind: 'pc', ref: thora }))).toBe(true);
    expect(sameIdentity(thora, token('t', { kind: 'pc', ref: { ...thora, pcId: 'p2' } }))).toBe(
      false,
    );
    expect(sameIdentity(goblinRef, token('g', { ref: goblinRef }))).toBe(true);
    const grak = { kind: 'custom', name: 'Grak the Bold' } as const;
    expect(
      sameIdentity(grak, token('g', { ref: { kind: 'custom', name: 'grak, the bold' } })),
    ).toBe(true);
    expect(sameIdentity(grak, token('g', { ref: goblinRef }))).toBe(false);
    const marker = { kind: 'custom', name: 'Marker' } as const;
    expect(sameIdentity(marker, token('m', { kind: 'marker', ref: marker }))).toBe(false);
  });
});

describe('autoLink', () => {
  it('ties a free token whose label is the combatant’s name first', () => {
    const tokens = [
      token('g2', { ref: goblinRef, label: 'Goblin 2' }),
      token('g1', { ref: goblinRef, label: 'Goblin 1' }),
    ];
    const fighters = [
      fighter('a', { name: 'Goblin 1', ref: goblinRef }),
      fighter('b', { name: 'Goblin 2', ref: goblinRef }),
    ];
    expect(autoLink(fighters, tokens)).toEqual([
      { combatantId: 'a', tokenId: 'g1' },
      { combatantId: 'b', tokenId: 'g2' },
    ]);
  });

  it('ties the one unlinked pair of an identity, and leaves a choice alone', () => {
    const wolf = { kind: 'custom', name: 'Wolf' } as const;
    const bear = { kind: 'custom', name: 'Bear' } as const;
    const tokens = [
      token('wolf-a', { ref: wolf, label: 'Wolf' }),
      token('bear-x', { ref: bear, label: 'Bear' }),
      token('bear-y', { ref: bear, label: 'Bear' }),
    ];
    const fighters = [
      fighter('w', { name: 'Wolf 1', ref: wolf }),
      fighter('b', { name: 'Bear 1', ref: bear }),
    ];
    expect(autoLink(fighters, tokens)).toEqual([{ combatantId: 'w', tokenId: 'wolf-a' }]);
    expect(tokenCandidates(fighters[1]!, fighters, tokens).map((t) => t.id)).toEqual([
      'bear-x',
      'bear-y',
    ]);
    expect(combatantCandidates(tokens[1]!, fighters, tokens).map((c) => c.id)).toEqual(['b']);
  });

  it('never reuses a taken token, and treats a token on another map as no link here', () => {
    const wolf = { kind: 'custom', name: 'Wolf' } as const;
    const tokens = [token('wolf-a', { ref: wolf, label: 'Wolf' })];
    const fighters = [
      fighter('w1', { name: 'Wolf 1', ref: wolf, tokenId: 'wolf-a' }),
      fighter('w2', { name: 'Wolf 2', ref: wolf, tokenId: 'elsewhere' }),
    ];
    expect(autoLink(fighters, tokens)).toEqual([]);
    expect(combatantCandidates(tokens[0]!, fighters, tokens)).toEqual([]);
    expect(autoLink([fighters[1]!], tokens)).toEqual([{ combatantId: 'w2', tokenId: 'wolf-a' }]);
  });
});

describe('sceneInPlay and the turn order', () => {
  const scene = (id: string, kind: Scene['kind']) => ({ id, kind }) as Scene;
  const scenes = [scene('title', 'title'), scene('cave', 'map'), scene('road', 'blankGrid')];

  it('prefers the live map, then the encounter’s map, else nothing', () => {
    expect(sceneInPlay(scenes, 'cave', { sceneId: 'road' })?.id).toBe('cave');
    expect(sceneInPlay(scenes, 'title', { sceneId: 'road' })?.id).toBe('road');
    expect(sceneInPlay(scenes, null, { sceneId: 'road' })?.id).toBe('road');
    expect(sceneInPlay(scenes, 'title', null)).toBeNull();
  });

  it('numbers linked tokens by their place in the order', () => {
    const order = turnOrderByToken([
      fighter('a', { tokenId: 't1' }),
      fighter('b'),
      fighter('c', { tokenId: 't3' }),
    ]);
    expect([...order.entries()]).toEqual([
      ['t1', 1],
      ['t3', 3],
    ]);
  });
});
