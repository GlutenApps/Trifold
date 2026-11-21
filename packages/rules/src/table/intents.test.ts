import { describe, expect, it } from 'vitest';
import {
  afterWrongPin,
  decideClaim,
  intentProblem,
  isPin,
  PIN_LOCK_MS,
  pinLocked,
} from './intents';
import type { TableCreature } from './types';

const creature = (extra: Partial<TableCreature> = {}): TableCreature => ({
  kind: 'pc',
  id: 'brannoc',
  name: 'Brannoc Hale',
  claimable: true,
  hp: { current: 20, max: 24, temp: 0 },
  ac: 16,
  conditions: [{ id: 'c1', name: 'Prone' }],
  inFight: true,
  needsInitiative: false,
  editable: { hp: true, maxHp: true, ac: true, conditions: true },
  ...extra,
});

describe('intentProblem', () => {
  it('accepts changes in range', () => {
    const c = creature();
    expect(intentProblem({ kind: 'hp', delta: -7 }, c)).toBeNull();
    expect(intentProblem({ kind: 'temp', delta: 5 }, c)).toBeNull();
    expect(intentProblem({ kind: 'maxHp', value: 30 }, c)).toBeNull();
    expect(intentProblem({ kind: 'ac', value: 18 }, c)).toBeNull();
    expect(intentProblem({ kind: 'addCondition', name: 'Poisoned' }, c)).toBeNull();
    expect(intentProblem({ kind: 'addCondition', name: 'Exhaustion', level: 2 }, c)).toBeNull();
    expect(intentProblem({ kind: 'removeCondition', id: 'c1' }, c)).toBeNull();
  });

  it('refuses values out of range or not whole', () => {
    const c = creature();
    expect(intentProblem({ kind: 'hp', delta: 0 }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'hp', delta: 1000 }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'hp', delta: 2.5 }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'maxHp', value: 0 }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'ac', value: 41 }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'addCondition', name: 'Doomed' }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'addCondition', name: 'Exhaustion', level: 7 }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'addCondition', name: 'Prone', level: 1 }, c)).not.toBeNull();
    expect(intentProblem({ kind: 'removeCondition', id: 'gone' }, c)).not.toBeNull();
  });

  it('refuses fields the creature cannot change now', () => {
    const outside = creature({
      inFight: false,
      editable: { hp: true, maxHp: false, ac: false, conditions: false },
    });
    expect(intentProblem({ kind: 'ac', value: 15 }, outside)).toMatch(/AC/);
    expect(intentProblem({ kind: 'addCondition', name: 'Prone' }, outside)).toMatch(
      /can’t be changed/,
    );
  });

  it('takes initiative only while the fight waits for it', () => {
    expect(intentProblem({ kind: 'initiative', value: 14 }, creature())).toMatch(/already/);
    const waiting = creature({ needsInitiative: true });
    expect(intentProblem({ kind: 'initiative', value: 14 }, waiting)).toBeNull();
    expect(intentProblem({ kind: 'initiative', value: 61 }, waiting)).not.toBeNull();
  });
});

describe('decideClaim', () => {
  const base = {
    mode: 'open' as const,
    offered: true,
    held: false,
    heldByAsker: false,
    grace: false,
    hasPin: false,
    pinMatches: (pin: string) => pin === '1234',
    locked: false,
  };

  it('claims a free creature, asking for a PIN to set in PIN mode', () => {
    expect(decideClaim(base)).toBe('grant');
    expect(decideClaim({ ...base, mode: 'pin' })).toBe('pinNeeded');
    expect(decideClaim({ ...base, mode: 'pin', pin: '0042' })).toBe('grant');
    expect(decideClaim({ ...base, mode: 'approval' })).toBe('grant');
  });

  it('never offers what is not offered, and knows what the device already holds', () => {
    expect(decideClaim({ ...base, offered: false })).toBe('notOffered');
    expect(decideClaim({ ...base, held: true, heldByAsker: true })).toBe('own');
  });

  it('reclaims or takes over through the mode', () => {
    const held = { ...base, held: true };
    expect(decideClaim(held)).toBe('grant');
    expect(decideClaim({ ...held, mode: 'approval' })).toBe('approval');
    expect(decideClaim({ ...held, mode: 'pin', hasPin: true })).toBe('pinNeeded');
    expect(decideClaim({ ...held, mode: 'pin', hasPin: true, pin: '1234' })).toBe('grant');
    expect(decideClaim({ ...held, mode: 'pin', hasPin: true, pin: '9999' })).toBe('pinWrong');
    expect(decideClaim({ ...held, mode: 'pin', hasPin: true, pin: '1234', locked: true })).toBe(
      'locked',
    );
    // Claimed before PIN mode was turned on: no PIN to check, so the DM decides.
    expect(decideClaim({ ...held, mode: 'pin', hasPin: false, pin: '1234' })).toBe('approval');
  });

  it('gives back what Switch character just released, in any mode', () => {
    expect(decideClaim({ ...base, mode: 'approval', grace: true })).toBe('grant');
    expect(decideClaim({ ...base, mode: 'pin', grace: true })).toBe('grant');
  });
});

describe('PIN tries', () => {
  it('locks for a minute after the fifth wrong PIN', () => {
    let tries = undefined as ReturnType<typeof afterWrongPin> | undefined;
    for (let i = 0; i < 4; i++) tries = afterWrongPin(tries, 1000);
    expect(pinLocked(tries, 1000)).toBe(false);
    tries = afterWrongPin(tries, 1000);
    expect(pinLocked(tries, 1000)).toBe(true);
    expect(pinLocked(tries, 1000 + PIN_LOCK_MS + 1)).toBe(false);
  });

  it('checks the PIN shape', () => {
    expect(isPin('0042')).toBe(true);
    expect(isPin('42')).toBe(false);
    expect(isPin('abcd')).toBe(false);
    expect(isPin(undefined)).toBe(false);
  });
});
