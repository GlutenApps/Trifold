import { describe, expect, it } from 'vitest';
import { formatTerms, parseDice, timesDice } from '../dice';
import { hordeAreaDamage, hordeAttackGroups, hordeCr, hordeStanding, hordeXp } from './horde';
import { rollAttack } from './rolls';

/** Hordes (ADR 0047, ADR 0052): one combatant, one pool of hit points, attacks in threes. */
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

  it('shows the CR it fights like, by the audit fit (ADR 0052)', () => {
    // Twelve or thirteen CR 1/2 creatures fight like a CR 6.
    expect(hordeCr('1/2', 12)).toBe('5');
    expect(hordeCr('1/2', 13)).toBe('6');
    // Bigger members climb faster: six CR 1/8 bandits are CR 1, six CR 2 creatures CR 7.
    expect(hordeCr('1/8', 6)).toBe('1');
    expect(hordeCr('2', 6)).toBe('7');
    // A CR 0 creature counts its table XP (10), so rats do climb, slowly.
    expect(hordeCr('0', 8)).toBe('1');
    // Never below a member's own CR, and one member is just itself.
    expect(hordeCr('20', 2)).toBe('20');
    expect(hordeCr('3', 1)).toBe('3');
    // The encounter budget counts that CR's XP.
    expect(hordeXp('1/2', 13)).toBe(2300);
  });

  it('attacks once for every three members standing (ADR 0052)', () => {
    expect(hordeAttackGroups(8)).toEqual([3, 3, 2]);
    expect(hordeAttackGroups(3)).toEqual([3]);
    expect(hordeAttackGroups(1)).toEqual([1]);
    expect(hordeAttackGroups(0)).toEqual([]);
  });

  it("takes area damage once for each member caught, up to a member's hit points", () => {
    const bandits = { memberHp: 11, size: 6 };
    // A Fireball of 28 catching three: 11 each, 33.
    expect(hordeAreaDamage(28, 3, bandits, 66)).toBe(33);
    // 8 damage stays 8 each: 24.
    expect(hordeAreaDamage(8, 3, bandits, 66)).toBe(24);
    // Never more members than are standing: two left (22 HP), five caught counts two.
    expect(hordeAreaDamage(28, 5, bandits, 22)).toBe(22);
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
