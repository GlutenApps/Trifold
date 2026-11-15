import type { NPC, PCCard } from '@trifold/schema';

/**
 * Whether a character is offered to players (ADR 0043, amended 2026-11-14): every party member
 * is, unless the DM unticked it; an NPC only once the DM ticks it. One reading of the stored
 * flag for the snapshot, the forms and the map.
 */
export const pcOffered = (pc: Pick<PCCard, 'playerControllable'>): boolean =>
  pc.playerControllable !== false;

export const npcOffered = (npc: Pick<NPC, 'playerControllable'>): boolean =>
  npc.playerControllable === true;
