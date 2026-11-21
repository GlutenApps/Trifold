import { average } from '../dice';
import { CR_ORDER, XP_BY_CR, normalizeCr, type ChallengeRating } from '../tables';

/**
 * Hordes (ADR 0047, ADR 0052): several of one creature fighting as one combatant, with one token,
 * one turn and one pool of hit points. It attacks in groups of three members standing, each group
 * one roll with its members' damage, so a hurt horde hits softer. One hit fells at most three
 * members; an area effect hurts each member it catches; tiny creatures bite as a swarm.
 */

/** How many of a horde's members still stand: the hit points left over one member's, rounded up. */
export function hordeStanding(hpLeft: number, memberHp: number, size: number): number {
  if (memberHp <= 0 || hpLeft <= 0) return 0;
  return Math.min(size, Math.ceil(hpLeft / memberHp));
}

/** Members per attack roll (ADR 0052). */
export const HORDE_GROUP = 3;

/**
 * The attack rolls a horde makes, as the members in each: eight standing make three rolls of 3,
 * 3 and 2 members' damage. One roll for every member at once could drop a PC in one hit.
 */
export function hordeAttackGroups(standing: number): number[] {
  const groups: number[] = [];
  for (let left = Math.max(0, Math.floor(standing)); left > 0; left -= HORDE_GROUP) {
    groups.push(Math.min(HORDE_GROUP, left));
  }
  return groups;
}

/**
 * Most members one hit can fell (ADR 0052): without it a sword stroke of 9 on a pool of 1-HP rats
 * would fell nine. Only creatures with fewer hit points than a third of a hit notice it.
 */
export const HORDE_HIT_MEMBERS = 3;

/**
 * The damage a horde takes from one hit or one area effect (ADR 0052), after resistances:
 * - one hit (`caught` 1) fells at most three members' worth of hit points;
 * - an area effect hurts each member it catches, up to one member's hit points, and no more
 *   members than are standing.
 */
export function hordeDamageTaken(
  amount: number,
  caught: number,
  horde: { memberHp: number; size: number },
  hpLeft: number,
): number {
  if (caught <= 1) return Math.min(amount, horde.memberHp * HORDE_HIT_MEMBERS);
  const standing = hordeStanding(hpLeft, horde.memberHp, horde.size);
  const members = Math.max(1, Math.min(standing || 1, Math.floor(caught)));
  return Math.min(amount, horde.memberHp) * members;
}

/**
 * A member's damage in a horde (ADR 0052): a tiny creature's bite (2 damage or less on average,
 * a Rat's 1) counts as 1d4, as a swarm's bites add up to more than one creature's. The SRD's own
 * Swarm of Rats bites for 2d6 where a Rat bites for 1. Other damage stays as it is.
 */
export const SWARM_BITE = '1d4';
export function hordeMemberDamage(expression: string): string {
  try {
    return average(expression) <= 2 ? SWARM_BITE : expression;
  } catch {
    return expression;
  }
}

/**
 * The challenge rating a horde fights like (ADR 0052): XP of 1.75 × (a member's XP)^0.775 ×
 * (members)^1.5, the CR whose XP is nearest (on a ratio scale), never below a member's own. A
 * fit to the 2026-11 fight-simulation audit (`scripts/cr-audit/horde.ts`) over hordes of 2 to 50:
 * twelve CR 1/2 creatures fight like a CR 6, fifty bandits like a CR 11. A member's XP is its
 * CR's from the table, so a CR 0 creature counts 10 XP even when its stat block says 0.
 */
export function hordeCr(memberCr: string, size: number): ChallengeRating {
  const cr = (normalizeCr(memberCr) ?? '0') as ChallengeRating;
  const own = CR_ORDER.includes(cr) ? cr : '0';
  if (size <= 1) return own;
  const xp = 1.75 * Math.pow(XP_BY_CR[own], 0.775) * Math.pow(size, 1.5);
  let best: ChallengeRating = own;
  let gap = Infinity;
  for (const c of CR_ORDER) {
    const d = Math.abs(Math.log(XP_BY_CR[c]) - Math.log(xp));
    if (d < gap) {
      gap = d;
      best = c;
    }
  }
  return CR_ORDER.indexOf(best) < CR_ORDER.indexOf(own) ? own : best;
}

/** A horde's XP: its CR's, which is what the encounter budget and the XP earned count. */
export function hordeXp(memberCr: string, size: number): number {
  return XP_BY_CR[hordeCr(memberCr, size)];
}

/** Hordes are built for weaker creatures; from this CR a horde of them gets a note (ADR 0052). */
export const HORDE_NOTE_FROM_CR = 3;
