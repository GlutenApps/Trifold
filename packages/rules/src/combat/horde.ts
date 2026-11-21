import { CR_ORDER, XP_BY_CR, type ChallengeRating } from '../tables';

/**
 * Hordes (ADR 0047): several of one creature fighting as one combatant, with one token, one turn
 * and one pool of hit points. Its attack is one attack whose damage is one member's for each
 * member still standing, so a hurt horde hits softer.
 */

/** How many of a horde's members still stand: the hit points left over one member's, rounded up. */
export function hordeStanding(hpLeft: number, memberHp: number, size: number): number {
  if (memberHp <= 0 || hpLeft <= 0) return 0;
  return Math.min(size, Math.ceil(hpLeft / memberHp));
}

/**
 * The challenge rating a horde shows: the highest CR whose XP fits within its members' XP
 * together. The encounter budget counts the members' XP either way, so a fight's difficulty is
 * the same whether they come as individuals or a horde.
 */
export function hordeCr(memberXp: number, size: number): ChallengeRating {
  const total = memberXp * Math.max(1, size);
  let best: ChallengeRating = CR_ORDER[0]!;
  for (const cr of CR_ORDER) {
    if (XP_BY_CR[cr] <= total) best = cr;
    else break;
  }
  return best;
}
