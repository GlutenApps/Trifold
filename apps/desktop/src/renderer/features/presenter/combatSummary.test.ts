import type { Combatant, CombatState } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import { summarizeCombat } from './combatSummary';

function c(id: string, extra: Partial<Combatant>): Combatant {
  return {
    id,
    name: id,
    maskedName: 'Beast',
    revealed: false,
    ref: { kind: 'custom', name: id },
    role: 'enemy',
    initiative: 10,
    initiativeBonus: 0,
    dexterity: 10,
    hp: { current: 10, max: 10, temp: 0 },
    saves: {},
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    conditions: [],
    concentrating: null,
    counters: [],
    recharges: [],
    deathSaves: null,
    dead: false,
    hidden: false,
    held: false,
    isLair: false,
    ...extra,
  };
}

describe('summarizeCombat', () => {
  const state: CombatState = {
    round: 2,
    turnIndex: 1,
    combatants: [
      c('thora', {
        ref: { kind: 'pc', pcId: 'p', name: 'Thora' },
        role: 'ally',
        hp: { current: 11, max: 44, temp: 0 },
      }),
      c('wolf', { hp: { current: 4, max: 11, temp: 0 } }),
      c('boss', { revealed: true, name: 'Guz' }),
      c('sneak', { hidden: true }),
      c('lair', { isLair: true }),
      c('dead', { dead: true, hp: { current: 0, max: 5, temp: 0 } }),
    ],
    log: [],
    startedAt: '2026-09-28T00:00:00.000Z',
  };

  it('masks unrevealed creatures, drops hidden and lair entries, marks bloodied and active', () => {
    const s = summarizeCombat(state, { pcHealthBars: true, hpDisplayMode: 'bloodied' })!;
    expect(s.round).toBe(2);
    expect(s.activeId).toBe('wolf');
    expect(s.entries.map((e) => [e.name, e.bloodied, e.dead, e.hpFraction])).toEqual([
      ['thora', false, false, 0.25],
      ['Beast', true, false, undefined],
      ['Guz', false, false, undefined],
      ['Beast', false, true, undefined],
    ]);
  });

  it('hides PC bars and bloodied markers when the options say so', () => {
    const s = summarizeCombat(state, { pcHealthBars: false, hpDisplayMode: 'hidden' })!;
    expect(s.entries.every((e) => e.hpFraction === undefined && !e.bloodied)).toBe(true);
    expect(summarizeCombat(null, { pcHealthBars: true, hpDisplayMode: 'exact' })).toBeNull();
  });
});
