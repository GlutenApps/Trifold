import { normalizeKey } from '@trifold/rules';
import type { Combatant, Encounter, EntityRef, Scene, Token } from '@trifold/schema';

/**
 * Ties between the running fight's combatants and the tokens on the map in play (ADR 0012).
 * A combatant and a token match on what they point at, never on a name alone: the same PC
 * card, the same NPC, the same compendium record, or the same custom name. A marker never
 * matches anything.
 */

export interface TokenLink {
  combatantId: string;
  tokenId: string;
}

type Linkable = Pick<Combatant, 'id' | 'ref' | 'name' | 'tokenId' | 'isLair'>;

/** What two references must share to be "the same thing"; null when nothing can match it. */
export function identityKey(ref: EntityRef): string | null {
  switch (ref.kind) {
    case 'pc':
      return `pc:${ref.pcId}`;
    case 'npc':
      return `npc:${ref.npcId}`;
    case 'record':
      return `record:${ref.ref.key || ref.ref.recordId}`;
    case 'custom': {
      const key = normalizeKey(ref.name);
      return key ? `custom:${key}` : null;
    }
  }
}

export function sameIdentity(ref: EntityRef, token: Pick<Token, 'kind' | 'ref'>): boolean {
  if (token.kind === 'marker') return false;
  const key = identityKey(ref);
  return key !== null && key === identityKey(token.ref);
}

/** Tokens on this map that no combatant is tied to. */
export function freeTokens(combatants: readonly Linkable[], tokens: readonly Token[]): Token[] {
  const taken = new Set(combatants.map((c) => c.tokenId).filter(Boolean));
  return tokens.filter((t) => t.kind !== 'marker' && !taken.has(t.id));
}

/** Combatants with no token on this map (a token elsewhere does not count). */
export function unlinkedCombatants<C extends Linkable>(
  combatants: readonly C[],
  tokens: readonly Token[],
): C[] {
  const here = new Set(tokens.map((t) => t.id));
  return combatants.filter((c) => !c.isLair && !(c.tokenId && here.has(c.tokenId)));
}

/** The free tokens this combatant could be tied to. */
export function tokenCandidates(
  combatant: Linkable,
  combatants: readonly Linkable[],
  tokens: readonly Token[],
): Token[] {
  return freeTokens(combatants, tokens).filter((t) => sameIdentity(combatant.ref, t));
}

/** The unlinked combatants this token could be tied to. */
export function combatantCandidates<C extends Linkable>(
  token: Token,
  combatants: readonly C[],
  tokens: readonly Token[],
): C[] {
  if (token.kind === 'marker' || combatants.some((c) => c.tokenId === token.id)) return [];
  return unlinkedCombatants(combatants, tokens).filter((c) => sameIdentity(c.ref, token));
}

/**
 * The links that need no one's judgement: a free token whose label is the combatant's name,
 * then any identity with exactly one unlinked combatant and one free token left. Everything
 * else stays for the DM to pick.
 */
export function autoLink(combatants: readonly Linkable[], tokens: readonly Token[]): TokenLink[] {
  const links: TokenLink[] = [];
  let free = freeTokens(combatants, tokens);
  let waiting = unlinkedCombatants(combatants, tokens);
  const take = (combatant: Linkable, token: Token) => {
    links.push({ combatantId: combatant.id, tokenId: token.id });
    free = free.filter((t) => t.id !== token.id);
    waiting = waiting.filter((c) => c.id !== combatant.id);
  };

  for (const c of [...waiting]) {
    const exact = free.filter((t) => sameIdentity(c.ref, t) && t.label === c.name);
    if (exact.length === 1) take(c, exact[0]!);
  }
  for (const c of [...waiting]) {
    const key = identityKey(c.ref);
    if (!key) continue;
    const peers = waiting.filter((x) => identityKey(x.ref) === key);
    const matches = free.filter((t) => sameIdentity(c.ref, t));
    if (peers.length === 1 && matches.length === 1) take(c, matches[0]!);
  }
  return links;
}

/**
 * The map the fight is compared against: the live scene when it is a map, else the scene the
 * encounter was placed on. Only this scene gets turn badges and add-to-fight buttons.
 */
export function sceneInPlay(
  scenes: readonly Scene[],
  liveSceneId: string | null,
  encounter: Pick<Encounter, 'sceneId'> | null,
): Scene | null {
  const live = liveSceneId ? scenes.find((s) => s.id === liveSceneId) : undefined;
  if (live && (live.kind === 'map' || live.kind === 'blankGrid')) return live;
  const placed = encounter?.sceneId ? scenes.find((s) => s.id === encounter.sceneId) : undefined;
  return placed ?? null;
}

/** 1-based place in the turn order for each token that a combatant is tied to. */
export function turnOrderByToken(combatants: readonly Linkable[]): Map<string, number> {
  const order = new Map<string, number>();
  combatants.forEach((c, i) => {
    if (c.tokenId) order.set(c.tokenId, i + 1);
  });
  return order;
}
