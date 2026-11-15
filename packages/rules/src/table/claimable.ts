import type { Role } from './types';

/**
 * Whether a flagged creature is offered in the player picker (docs/PLAYER-CONNECTOR.md,
 * decisions 1 and 13). A PC card is offered whenever it is flagged. An NPC is offered while it
 * is flagged and none of its tokens on the live scene, nor its combatant in the running fight,
 * is marked enemy; with no token and no fight the flag alone decides.
 */
export function isClaimable(
  kind: 'pc' | 'npc',
  playerControllable: boolean,
  roles: readonly Role[],
): boolean {
  if (!playerControllable) return false;
  if (kind === 'pc') return true;
  return !roles.includes('enemy');
}
