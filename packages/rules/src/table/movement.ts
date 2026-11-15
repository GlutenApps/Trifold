import { isRevealed, tokenCentre } from '../fog';
import type { AnyCreatureKind, CreatureKind, TableCreature, TableScene, TableToken } from './types';

/** A drag lock lapses after this long without a preview or a hold (Concurrency). */
export const LOCK_TTL_MS = 3_000;

/** Previews a phone may send per second while dragging. */
export const PREVIEWS_PER_SECOND = 10;

/**
 * Who is dragging which token (Phase 3 plan, "A drag, start to finish"). In memory only: a lock
 * lives for a drag. One device per token; a lock lapses without a heartbeat; the DM can always
 * take it away.
 */
export class DragLocks {
  private locks = new Map<string, { deviceId: string; until: number }>();

  constructor(private readonly ttl = LOCK_TTL_MS) {}

  /** Grants the lock unless another device holds it; refreshes it for the same device. */
  grant(tokenId: string, deviceId: string, now: number): boolean {
    const held = this.holder(tokenId, now);
    if (held && held !== deviceId) return false;
    this.locks.set(tokenId, { deviceId, until: now + this.ttl });
    return true;
  }

  /** Keeps a lock alive; false when the device no longer holds it. */
  refresh(tokenId: string, deviceId: string, now: number): boolean {
    if (this.holder(tokenId, now) !== deviceId) return false;
    this.locks.set(tokenId, { deviceId, until: now + this.ttl });
    return true;
  }

  holder(tokenId: string, now: number): string | null {
    const lock = this.locks.get(tokenId);
    return lock && lock.until > now ? lock.deviceId : null;
  }

  /** Ends one lock; returns who held it. */
  release(tokenId: string): string | null {
    const lock = this.locks.get(tokenId);
    this.locks.delete(tokenId);
    return lock?.deviceId ?? null;
  }

  /** Ends every lock a device holds (it disconnected or lost its claims). */
  releaseDevice(deviceId: string): string[] {
    const tokens = [...this.locks].filter(([, l]) => l.deviceId === deviceId).map(([t]) => t);
    for (const t of tokens) this.locks.delete(t);
    return tokens;
  }

  /** Removes and returns the locks that lapsed. */
  sweep(now: number): Array<{ tokenId: string; deviceId: string }> {
    const out: Array<{ tokenId: string; deviceId: string }> = [];
    for (const [tokenId, lock] of this.locks) {
      if (lock.until <= now) {
        out.push({ tokenId, deviceId: lock.deviceId });
        this.locks.delete(tokenId);
      }
    }
    return out;
  }

  /** Live locks: token id → device id. */
  active(now: number): Map<string, string> {
    const out = new Map<string, string>();
    for (const [tokenId, lock] of this.locks) if (lock.until > now) out.set(tokenId, lock.deviceId);
    return out;
  }

  clear(): void {
    this.locks.clear();
  }
}

/** Movement locks the DM set (Phase 3 plan, "Locking movement"). */
export interface MovementLocks {
  all: boolean;
  /** `kind:id` of creatures whose movement is locked. */
  creatures: readonly string[];
}

export const creatureKey = (kind: AnyCreatureKind, id: string) => `${kind}:${id}`;

export function movementLocked(locks: MovementLocks, kind: CreatureKind, id: string): boolean {
  return locks.all || locks.creatures.includes(creatureKey(kind, id));
}

/**
 * Why a player's drop is refused, or null when the console may move the token (Phase 3 plan,
 * step 3): it must still stand where the drag began (else someone moved it meanwhile), stay on
 * the map, and its centre must land in a revealed area (decision 12).
 */
export function dropProblem(
  scene: TableScene,
  token: TableToken,
  to: { x: number; y: number },
  from: { x: number; y: number },
): string | null {
  const rest = token.restsAt ?? token;
  if (rest.x !== from.x || rest.y !== from.y) return 'It moved while you were dragging it.';
  if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return 'That spot is not on the map.';
  const centre = tokenCentre({ ...token, x: to.x, y: to.y }, scene.grid);
  if (centre.x < 0 || centre.y < 0 || centre.x > scene.width || centre.y > scene.height) {
    return 'That spot is not on the map.';
  }
  if (!isRevealed(scene.fog, centre)) return 'You can’t see that spot.';
  return null;
}

/** A drop on a grid lands on whole cells, as a DM drag does without Alt. */
export const snapToCell = (p: { x: number; y: number }) => ({
  x: Math.round(p.x),
  y: Math.round(p.y),
});

/** The companions of a PC among the creatures the table knows (Phase 3 plan, "Companions"). */
export function companionsOf(
  creatures: readonly TableCreature[],
  pcId: string,
): Array<TableCreature & { kind: 'npc' }> {
  return creatures.filter(
    (c): c is TableCreature & { kind: 'npc' } => c.kind === 'npc' && c.companionOf === pcId,
  );
}
