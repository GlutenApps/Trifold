import { describe, expect, it } from 'vitest';
import {
  rollForTable,
  TABLE_ROLL_MAX_DICE,
  TABLE_ROLL_MAX_LENGTH,
  tableRollProblem,
} from './rolls';

/** A die that always shows its highest face. */
const high = () => 0.999;
/** A die that always shows a 1. */
const low = () => 0;

describe('rollForTable', () => {
  it('makes the roll a player asked for, worded as a roll log words it', () => {
    expect(rollForTable(' 2d6+3 ', high)).toEqual({
      ok: true,
      roll: { label: '2d6+3', expression: '2d6+3', total: 15, faces: '2d6: 6, 6' },
    });
  });

  it('marks a natural 20 or 1 on a lone d20, and says when it rolled with advantage', () => {
    const crit = rollForTable('d20+5 adv', high);
    expect(crit).toMatchObject({
      ok: true,
      roll: { label: 'd20+5 (advantage)', total: 25, outcome: 'crit' },
    });
    expect(rollForTable('1d20', low)).toMatchObject({ ok: true, roll: { outcome: 'fumble' } });
    // Two d20s are not a d20 test.
    expect(rollForTable('2d20', high)).toMatchObject({ ok: true, roll: { total: 40 } });
    expect(rollForTable('2d20', high)).not.toHaveProperty('roll.outcome');
  });

  it('shows the dice a roll kept', () => {
    const made = rollForTable('4d6kh3', high);
    expect(made).toMatchObject({ ok: true, roll: { total: 18 } });
    expect(made.ok && made.roll.faces).toBe('4d6: 6, 6, 6, 6 → 6, 6, 6');
  });

  it('refuses what is not a roll, what is too long and too many dice', () => {
    expect(rollForTable('fireball')).toMatchObject({ ok: false });
    expect(rollForTable('')).toMatchObject({ ok: false });
    expect(rollForTable(`1d6${'+1'.repeat(TABLE_ROLL_MAX_LENGTH)}`)).toEqual({
      ok: false,
      problem: 'That roll is too long for the table.',
    });
    expect(rollForTable(`${TABLE_ROLL_MAX_DICE}d6`)).toMatchObject({ ok: true });
    expect(rollForTable(`${TABLE_ROLL_MAX_DICE + 1}d6`)).toEqual({
      ok: false,
      problem: 'The table rolls up to 100 dice at once.',
    });
  });

  it('gives a player’s Trifold the same first check before it asks', () => {
    expect(tableRollProblem('2d6+3')).toBeNull();
    expect(tableRollProblem('d20 dis')).toBeNull();
    expect(tableRollProblem('two dice')).toBe('Cannot read "two dice".');
  });
});
