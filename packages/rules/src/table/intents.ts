import type { ReclaimMode, TableCreature, TableIntent } from './types';

/**
 * The conditions the tracker offers, in its order: the SRD conditions, then three markers the
 * tracker keeps that have no rules text (DESIGN.md §7.3). Shared by the tracker and the phones.
 */
export const CONDITION_NAMES = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
  'Concentrating',
  'Surprised',
  'Hidden',
] as const;

/** Markers with no rules text in the compendium. */
export const TRACKER_ONLY_CONDITIONS: ReadonlySet<string> = new Set([
  'Concentrating',
  'Surprised',
  'Hidden',
]);

export const INTENT_LIMITS = {
  delta: 999,
  maxHp: { min: 1, max: 999 },
  ac: { min: 0, max: 40 },
  initiative: { min: -20, max: 60 },
  exhaustion: { min: 1, max: 6 },
} as const;

const whole = (n: number) => Number.isInteger(n);
const within = (n: number, r: { min: number; max: number }) => whole(n) && n >= r.min && n <= r.max;

/**
 * Why a player's change to one of their creatures is refused, or null when it may go to the
 * console (Phase 2 plan): the field must be editable for this creature now, and the value in range.
 */
export function intentProblem(intent: TableIntent, creature: TableCreature): string | null {
  switch (intent.kind) {
    case 'hp':
    case 'temp':
      if (!creature.editable.hp) return 'HP can’t be changed here.';
      if (
        !whole(intent.delta) ||
        intent.delta === 0 ||
        Math.abs(intent.delta) > INTENT_LIMITS.delta
      ) {
        return 'Enter a whole number up to 999.';
      }
      return null;
    case 'maxHp':
      if (!creature.editable.maxHp) return 'Max HP can’t be changed here.';
      return within(intent.value, INTENT_LIMITS.maxHp) ? null : 'Max HP must be 1 to 999.';
    case 'ac':
      if (!creature.editable.ac) return 'AC can’t be changed here.';
      return within(intent.value, INTENT_LIMITS.ac) ? null : 'AC must be 0 to 40.';
    case 'addCondition':
      if (!creature.editable.conditions) return 'Conditions are tracked during fights.';
      if (!(CONDITION_NAMES as readonly string[]).includes(intent.name))
        return 'Unknown condition.';
      if (intent.level !== undefined) {
        if (intent.name !== 'Exhaustion' || !within(intent.level, INTENT_LIMITS.exhaustion)) {
          return 'Exhaustion levels are 1 to 6.';
        }
      }
      return null;
    case 'removeCondition':
      if (!creature.editable.conditions) return 'Conditions are tracked during fights.';
      return creature.conditions.some((c) => c.id === intent.id) ? null : 'That condition is gone.';
    case 'initiative':
      if (!creature.needsInitiative) return 'Initiative is already in.';
      return within(intent.value, INTENT_LIMITS.initiative)
        ? null
        : 'Initiative must be −20 to 60.';
  }
}

/** A 4-digit PIN. */
export const isPin = (pin: string | undefined): pin is string => !!pin && /^\d{4}$/.test(pin);

export type ClaimOutcome =
  /** Take it now. */
  | 'grant'
  /** Ask the DM (Approval mode, or a held creature with no PIN in PIN mode). */
  | 'approval'
  /** PIN mode: a PIN is needed (to set on a first claim, or to check on a reclaim). */
  | 'pinNeeded'
  | 'pinWrong'
  /** Too many wrong PINs: wait. */
  | 'locked'
  /** Not offered to players now. */
  | 'notOffered'
  /** This device already holds it. */
  | 'own';

/**
 * What a tap in the picker does (Claiming, reclaiming and releasing; Phase 2 plan). A free
 * creature is claimed, with a PIN set first in PIN mode. A held one is reclaimed or taken over
 * through the campaign's reclaim mode; within Switch character's undo grace it comes straight
 * back.
 */
export function decideClaim(input: {
  mode: ReclaimMode;
  offered: boolean;
  held: boolean;
  heldByAsker: boolean;
  /** This device released it moments ago with Switch character. */
  grace: boolean;
  pin?: string | undefined;
  /** The held claim has a PIN stored. */
  hasPin: boolean;
  pinMatches: (pin: string) => boolean;
  locked: boolean;
}): ClaimOutcome {
  if (input.heldByAsker) return 'own';
  if (input.grace && !input.held) return 'grant';
  if (!input.offered) return 'notOffered';
  if (!input.held) {
    if (input.mode === 'pin' && !isPin(input.pin)) return 'pinNeeded';
    return 'grant';
  }
  switch (input.mode) {
    case 'open':
      return 'grant';
    case 'approval':
      return 'approval';
    case 'pin':
      if (!input.hasPin) return 'approval';
      if (input.locked) return 'locked';
      if (!isPin(input.pin)) return 'pinNeeded';
      return input.pinMatches(input.pin) ? 'grant' : 'pinWrong';
  }
}

/** PIN lockout: five wrong tries lock a creature's PIN for a minute. */
export const PIN_TRIES = 5;
export const PIN_LOCK_MS = 60_000;

export interface PinTries {
  wrong: number;
  lockedUntil: number;
}

export function pinLocked(tries: PinTries | undefined, now: number): boolean {
  return !!tries && tries.lockedUntil > now;
}

/** The tries after a wrong PIN: the fifth locks it and starts the count again. */
export function afterWrongPin(tries: PinTries | undefined, now: number): PinTries {
  const wrong = (tries && tries.lockedUntil <= now ? tries.wrong : 0) + 1;
  return wrong >= PIN_TRIES
    ? { wrong: 0, lockedUntil: now + PIN_LOCK_MS }
    : { wrong, lockedUntil: 0 };
}

/** How long Switch character's Undo lasts. */
export const UNDO_MS = 5_000;
