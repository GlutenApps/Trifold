import { isRevealed, tokenCentre, type FogLike, type GridLike } from '../fog';
import type { SummonMode, SummonRequest } from './types';

/** Summoning's limits (Phase 4 plan, "DM guardrails" and "Add options"). */
export const SUMMON_LIMITS = { count: 8, rounds: 100, cap: 20, defaultCap: 8 } as const;

interface Place {
  x: number;
  y: number;
  footprint: number;
}

/**
 * Where `count` new tokens of `footprint` cells go: the nearest free cells around the owner, ring
 * by ring, on the map and in a revealed area (a summon never lands under fog, decision 12). Free
 * means no token's cells overlap it. Fewer than `count` cells when the space runs out.
 */
export function freeCellsNear(
  owner: Place,
  footprint: number,
  count: number,
  occupied: readonly Place[],
  map: { cols: number; rows: number },
  fog: FogLike | null,
  grid: GridLike,
): Array<{ x: number; y: number }> {
  const taken: Place[] = [...occupied];
  const out: Array<{ x: number; y: number }> = [];
  const overlaps = (a: Place, b: Place) =>
    a.x < b.x + b.footprint &&
    b.x < a.x + a.footprint &&
    a.y < b.y + b.footprint &&
    b.y < a.y + a.footprint;
  const ox = Math.round(owner.x);
  const oy = Math.round(owner.y);
  const maxRing = Math.max(map.cols, map.rows);
  for (let ring = 1; ring <= maxRing && out.length < count; ring++) {
    for (let dy = -ring; dy <= ring + owner.footprint - 1 && out.length < count; dy++) {
      for (let dx = -ring; dx <= ring + owner.footprint - 1 && out.length < count; dx++) {
        // Only the cells on this ring, nearest first along each row.
        const onRing =
          dx === -ring ||
          dy === -ring ||
          dx === ring + owner.footprint - 1 ||
          dy === ring + owner.footprint - 1;
        if (!onRing) continue;
        const cell: Place = { x: ox + dx, y: oy + dy, footprint };
        if (cell.x < 0 || cell.y < 0) continue;
        if (cell.x + footprint > map.cols || cell.y + footprint > map.rows) continue;
        if (taken.some((t) => overlaps(t, cell))) continue;
        if (!isRevealed(fog, tokenCentre(cell, grid))) continue;
        taken.push(cell);
        out.push({ x: cell.x, y: cell.y });
      }
    }
  }
  return out;
}

/**
 * Labels for new summons: the name alone for one with no namesake in play, else numbered after
 * the highest number already in play ("Skeleton 1" to "Skeleton 4", then "Skeleton 5").
 */
export function summonLabels(name: string, count: number, inPlay: readonly string[]): string[] {
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: (\\d+))?$`);
  let highest = 0;
  let namesake = false;
  for (const label of inPlay) {
    const m = pattern.exec(label);
    if (!m) continue;
    namesake = true;
    highest = Math.max(highest, m[1] ? Number(m[1]) : 1);
  }
  if (count === 1 && !namesake) return [name];
  return Array.from({ length: count }, (_, i) => `${name} ${highest + i + 1}`);
}

/**
 * Why a summon is refused, or null (Phase 4 plan): summoning must be on, the owner held by the
 * asking device, the creature on the DM's list, a map on the TV to put it on, and the owner under
 * its cap with this many more.
 */
export function summonProblem(input: {
  mode: SummonMode;
  request: SummonRequest;
  ownerHeld: boolean;
  optionExists: boolean;
  hasMap: boolean;
  inPlay: number;
  cap: number;
}): string | null {
  const { request } = input;
  if (input.mode === 'off') return 'The DM has turned summoning off.';
  if (!input.ownerHeld) return 'That character isn’t yours on this device.';
  if (!input.optionExists) return 'That creature isn’t on the DM’s summon list.';
  if (!input.hasMap) return 'Summons need a map on the TV.';
  if (
    !Number.isInteger(request.count) ||
    request.count < 1 ||
    request.count > SUMMON_LIMITS.count
  ) {
    return `Summon 1 to ${SUMMON_LIMITS.count} at a time.`;
  }
  if (
    request.rounds !== undefined &&
    (!Number.isInteger(request.rounds) ||
      request.rounds < 1 ||
      request.rounds > SUMMON_LIMITS.rounds)
  ) {
    return `A summon lasts 1 to ${SUMMON_LIMITS.rounds} rounds.`;
  }
  if (input.inPlay + request.count > input.cap) {
    return `That would make more than ${input.cap} in play for this character.`;
  }
  return null;
}

/** Whether a summon's time is up at this round. */
export const summonExpired = (expiresAtRound: number | undefined, round: number) =>
  expiresAtRound !== undefined && round >= expiresAtRound;
