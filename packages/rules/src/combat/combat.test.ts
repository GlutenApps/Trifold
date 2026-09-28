import { describe, expect, it } from 'vitest';
import {
  advanceTurn,
  applyDamage,
  applyDeathSave,
  applyHealing,
  compareInitiative,
  concentrationDc,
  damageMultiplier,
  grantTempHp,
  numberedNames,
  parseQuickAdd,
  parseRollRequest,
  rewindTurn,
  rollAttack,
  rollD20,
  rollRequest,
  type TurnCombatant,
} from './index';

function seq(values: number[], sides: number) {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 1;
    i += 1;
    return (v - 1) / sides;
  };
}

describe('d20 and attack rolls', () => {
  it('applies advantage and disadvantage', () => {
    expect(rollD20(3, 'advantage', seq([4, 17], 20))).toMatchObject({
      faces: [4, 17],
      natural: 17,
      total: 20,
    });
    expect(rollD20(3, 'disadvantage', seq([4, 17], 20))).toMatchObject({ natural: 4, total: 7 });
    expect(rollD20(3, 'normal', seq([11], 20))).toMatchObject({ faces: [11], total: 14 });
  });

  it('detects crits and doubles the dice but not the modifier', () => {
    // d20 = 20, then damage dice 2d6 doubled to 4d6 → faces 3,3,3,3
    const r = rollAttack(
      { toHit: 5, damage: '2d6+3', extraDamage: [{ damage: '1d6', damageType: 'fire' }] },
      'normal',
      seq([20, 3, 3, 3, 3, 4, 4], 20),
    );
    expect(r.crit).toBe(true);
    expect(r.damage?.expression).toBe('4d6+3');
    expect(r.extraDamage[0]?.expression).toBe('2d6');
    expect(r.extraDamage[0]?.damageType).toBe('fire');
  });

  it('rolls damage only when there is no to-hit', () => {
    const r = rollAttack({ damage: '3d6' }, 'normal', seq([2], 6));
    expect(r.crit).toBe(false);
    expect(r.damage?.total).toBe(6);
  });
});

describe('roller requests', () => {
  it('parses adv/dis suffixes and bare modifiers', () => {
    expect(parseRollRequest('d20 adv')).toEqual({ expression: 'd20', mode: 'advantage' });
    expect(parseRollRequest('1d20+5 dis')).toEqual({ expression: '1d20+5', mode: 'disadvantage' });
    expect(parseRollRequest('+5')).toEqual({ expression: '1d20+5', mode: 'normal' });
    expect(parseRollRequest('2d6+3')).toEqual({ expression: '2d6+3', mode: 'normal' });
    expect(parseRollRequest('')).toBeNull();
    expect(parseRollRequest('nope')).toBeNull();
  });

  it('rolls advantage on a single d20 request', () => {
    const r = rollRequest({ expression: 'd20+2', mode: 'advantage' }, seq([3, 18], 20));
    expect(r.total).toBe(20);
    expect(r.d20?.faces).toEqual([3, 18]);
  });
});

describe('damage', () => {
  const profile = {
    vulnerabilities: ['fire'],
    resistances: ['bludgeoning, piercing, and slashing from nonmagical attacks', 'cold'],
    immunities: ['poison'],
  };

  it('picks the multiplier by type, flagging qualified entries', () => {
    expect(damageMultiplier('fire', profile)).toMatchObject({
      multiplier: 2,
      reason: 'vulnerable',
    });
    expect(damageMultiplier('Cold', profile)).toMatchObject({ multiplier: 0.5, qualified: false });
    expect(damageMultiplier('slashing', profile)).toMatchObject({
      multiplier: 0.5,
      qualified: true,
    });
    expect(damageMultiplier('poison', profile)).toMatchObject({ multiplier: 0 });
    expect(damageMultiplier('radiant', profile)).toMatchObject({ multiplier: 1 });
    expect(damageMultiplier(undefined, profile)).toMatchObject({ multiplier: 1 });
  });

  it('absorbs with temp HP first and reports massive damage', () => {
    const r = applyDamage({ current: 20, max: 20, temp: 5 }, 12);
    expect(r).toMatchObject({
      absorbedByTemp: 5,
      dealt: 7,
      hp: { current: 13, temp: 0 },
      massive: false,
    });
    const half = applyDamage({ current: 20, max: 20, temp: 0 }, 11, 0.5);
    expect(half.adjusted).toBe(5);
    const huge = applyDamage({ current: 5, max: 20, temp: 0 }, 30);
    expect(huge.hp.current).toBe(0);
    expect(huge.massive).toBe(true);
  });

  it('heals to max, keeps the higher temp HP, computes the concentration DC', () => {
    expect(applyHealing({ current: 3, max: 20, temp: 0 }, 50).current).toBe(20);
    expect(grantTempHp({ current: 3, max: 20, temp: 8 }, 5).temp).toBe(8);
    expect(concentrationDc(7)).toBe(10);
    expect(concentrationDc(31)).toBe(15);
  });
});

describe('initiative order and death saves', () => {
  it('sorts by initiative, lair first at ties, then dex, then order', () => {
    const list = [
      { initiative: 15, dexterity: 12, order: 0 },
      { initiative: 20, dexterity: 10, order: 1 },
      { initiative: 20, dexterity: 10, order: 2, isLair: true },
      { initiative: 15, dexterity: 14, order: 3 },
      { initiative: null, dexterity: 18, order: 4 },
    ];
    expect([...list].sort(compareInitiative).map((e) => e.order)).toEqual([2, 1, 3, 0, 4]);
  });

  it('applies death save rules', () => {
    expect(applyDeathSave({ successes: 0, failures: 0 }, 20).revived).toBe(true);
    expect(applyDeathSave({ successes: 0, failures: 1 }, 1)).toMatchObject({ dead: true });
    expect(applyDeathSave({ successes: 2, failures: 0 }, 12)).toMatchObject({
      stable: true,
      saves: { successes: 0, failures: 0 },
    });
    expect(applyDeathSave({ successes: 0, failures: 0 }, 9).saves).toEqual({
      successes: 0,
      failures: 1,
    });
  });
});

describe('quick add and masking', () => {
  it('parses the one-line PC format leniently', () => {
    expect(
      parseQuickAdd('Thora, Sam, Fighter 5, 44, 18, +1, 30, 12\nZed, , Wizard L3\n# comment\n'),
    ).toEqual([
      {
        name: 'Thora',
        playerName: 'Sam',
        classText: 'Fighter',
        level: 5,
        maxHp: 44,
        ac: 18,
        initiativeBonus: 1,
        speed: 30,
        passivePerception: 12,
      },
      { name: 'Zed', classText: 'Wizard', level: 3 },
    ]);
  });

  it('numbers groups', () => {
    expect(numberedNames('Goblin', 3)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
    expect(numberedNames('Goblin', 1)).toEqual(['Goblin']);
  });
});

describe('turn loop', () => {
  const c = (id: string, extra: Partial<TurnCombatant> = {}): TurnCombatant => ({
    id,
    name: id,
    dead: false,
    held: false,
    conditions: [],
    counters: [],
    recharges: [],
    ...extra,
  });

  it('starts at round 1, skips the dead and held, wraps into a new round', () => {
    const state = {
      round: 0,
      turnIndex: -1,
      combatants: [c('a'), c('b', { dead: true }), c('c', { held: true }), c('d')],
    };
    const t1 = advanceTurn(state, () => 0);
    expect(t1.state).toMatchObject({ round: 1, turnIndex: 0 });
    expect(t1.events.map((e) => e.text)).toEqual(['Round 1', "a's turn"]);
    const t2 = advanceTurn(t1.state, () => 0);
    expect(t2.state.turnIndex).toBe(3);
    const t3 = advanceTurn(t2.state, () => 0);
    expect(t3.state).toMatchObject({ round: 2, turnIndex: 0 });
    expect(rewindTurn(t3.state)).toMatchObject({ round: 1, turnIndex: 3 });
  });

  it('runs start-of-turn automation: recharge, legendary reset, condition expiry, round countdown', () => {
    const state = {
      round: 1,
      turnIndex: 1,
      combatants: [
        c('dragon', {
          counters: [{ id: 'la', name: 'Legendary actions', max: 3, current: 0, resets: 'turn' }],
          recharges: [{ id: 'fb', featureName: 'Fire Breath', min: 5, available: false }],
          conditions: [{ id: 'x', name: 'Blessed', duration: { kind: 'rounds', remaining: 1 } }],
        }),
        c('rogue', {
          conditions: [
            {
              id: 'y',
              name: 'Frightened',
              duration: { kind: 'untilStartOfTurn', combatantId: 'dragon' },
            },
            { id: 'z', name: 'Poisoned', duration: { kind: 'untilSave', ability: 'con', dc: 13 } },
          ],
        }),
      ],
    };
    const r = advanceTurn(state, () => 0.99); // d6 = 6 → recharged
    expect(r.state.turnIndex).toBe(0);
    expect(r.state.round).toBe(2);
    const dragon = r.state.combatants[0]!;
    expect(dragon.counters[0]?.current).toBe(3);
    expect(dragon.recharges[0]?.available).toBe(true);
    expect(dragon.conditions).toEqual([]);
    expect(r.state.combatants[1]?.conditions.map((x) => x.name)).toEqual(['Poisoned']);
    expect(r.savePrompts).toEqual([
      { combatantId: 'rogue', conditionId: 'z', conditionName: 'Poisoned', ability: 'con', dc: 13 },
    ]);
    expect(r.events.some((e) => e.text.includes('Fire Breath recharge roll 6'))).toBe(true);
  });

  it('ends untilEndOfTurn conditions when that turn ends', () => {
    const state = {
      round: 1,
      turnIndex: 0,
      combatants: [
        c('a'),
        c('b', {
          conditions: [
            { id: 'q', name: 'Marked', duration: { kind: 'untilEndOfTurn', combatantId: 'a' } },
          ],
        }),
      ],
    };
    const r = advanceTurn(state, () => 0);
    expect(r.state.combatants[1]?.conditions).toEqual([]);
  });
});
