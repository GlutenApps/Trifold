import { describe, expect, it } from 'vitest';
import { formatTerms, parseDice, timesDice } from '../dice';
import { hordeCr, hordeStanding } from './horde';
import { rollAttack } from './rolls';

/** Hordes (ADR 0047): one combatant, one pool of hit points, damage per member standing. */
describe('hordes', () => {
  it('counts the members still standing from the hit points left', () => {
    // Four bandits of 11 HP: 44 at full.
    expect(hordeStanding(44, 11, 4)).toBe(4);
    expect(hordeStanding(34, 11, 4)).toBe(4);
    expect(hordeStanding(33, 11, 4)).toBe(3);
    expect(hordeStanding(20, 11, 4)).toBe(2);
    expect(hordeStanding(1, 11, 4)).toBe(1);
    expect(hordeStanding(0, 11, 4)).toBe(0);
    // Healed past full never makes more members than it has.
    expect(hordeStanding(60, 11, 4)).toBe(4);
  });

  it('shows the highest CR whose XP fits the members together', () => {
    // Four CR 1/8 bandits: 100 XP, so CR 1/2 (100 XP).
    expect(hordeCr(25, 4)).toBe('1/2');
    // Six CR 1/4 goblins: 300 XP, so CR 1 (200 XP); CR 2 (450 XP) does not fit.
    expect(hordeCr(50, 6)).toBe('1');
    // Ten CR 1 creatures: 2,000 XP, so CR 5 (1,800 XP).
    expect(hordeCr(200, 10)).toBe('5');
  });

  it('takes damage dice n times over as one roll', () => {
    expect(formatTerms(timesDice(parseDice('1d6+2'), 3))).toBe('3d6+6');
    expect(formatTerms(timesDice(parseDice('2d8-1'), 2))).toBe('4d8-2');
    expect(formatTerms(timesDice(parseDice('1d6+2'), 1))).toBe('1d6+2');
  });

  it("rolls an attack's damage once per member, doubling the dice on a crit", () => {
    // rng 0.999 rolls the top face: d20 = 20 (a crit), each d6 = 6.
    const top = () => 0.999;
    const hit = rollAttack({ toHit: 3, damage: '1d6+2' }, 'normal', top, 3);
    expect(hit.crit).toBe(true);
    // Three members: 3d6+6, doubled dice on the crit: 6d6+6 = 42.
    expect(hit.damage?.total).toBe(42);
    // A lone attacker as before: 2d6+2 on a crit = 14.
    expect(rollAttack({ toHit: 3, damage: '1d6+2' }, 'normal', top).damage?.total).toBe(14);
  });
});
