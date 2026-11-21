import { CR_ORDER, XP_BY_CR, normalizeCr, type ChallengeRating } from '../tables';

/**
 * Hordes (ADR 0047, ADR 0052): several of one creature fighting as one combatant, with one token,
 * one turn and one pool of hit points. It attacks in groups of three members standing, each group
 * one roll with its members' damage, so a hurt horde hits softer; an area effect hurts each
 * member it catches.
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
 * Damage to a horde from an area effect (ADR 0052): each member caught takes the damage, but no
 * more than one member's hit points, and no more members than are standing.
 */
export function hordeAreaDamage(
  amount: number,
  caught: number,
  horde: { memberHp: number; size: number },
  hpLeft: number,
): number {
  const standing = hordeStanding(hpLeft, horde.memberHp, horde.size);
  const members = Math.max(1, Math.min(standing || 1, Math.floor(caught)));
  return Math.min(amount, horde.memberHp) * members;
}

/**
 * The challenge rating a horde fights like (ADR 0052): XP of 1.6 × (a member's XP)^0.85 ×
 * (members)^1.3, the CR whose XP is nearest (on a ratio scale), never below a member's own. A
 * fit to the 2026-11 fight-simulation audit (`scripts/cr-audit/horde.ts`): twelve or thirteen
 * CR 1/2 creatures fight like a CR 6. A member's XP is its CR's from the table, so a CR 0
 * creature counts 10 XP even when its stat block says 0.
 */
export function hordeCr(memberCr: string, size: number): ChallengeRating {
  const cr = (normalizeCr(memberCr) ?? '0') as ChallengeRating;
  const own = CR_ORDER.includes(cr) ? cr : '0';
  if (size <= 1) return own;
  const xp = 1.6 * Math.pow(XP_BY_CR[own], 0.85) * Math.pow(size, 1.3);
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
