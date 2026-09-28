import type { CombatState, LogEntry } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import { formatCombatLog, formatResultLog, logFileName } from './logExport';

const entry = (round: number, text: string, kind: LogEntry['kind'] = 'note'): LogEntry => ({
  id: `${round}-${text}`,
  at: `2026-09-28T19:0${round}:05.000Z`,
  round,
  kind,
  text,
});

const state: CombatState = {
  round: 2,
  turnIndex: 0,
  startedAt: '2026-09-28T19:00:00.000Z',
  log: [
    entry(0, 'Thora rolls initiative 17', 'roll'),
    entry(1, 'Goblin hits Thora for 5', 'damage'),
    entry(2, 'Thora is Prone', 'condition'),
  ],
  combatants: [
    {
      id: 'a',
      name: 'Thora',
      maskedName: 'Thora',
      revealed: true,
      ref: { kind: 'pc', pcId: 'p', name: 'Thora' },
      role: 'ally',
      initiative: 17,
      initiativeBonus: 1,
      dexterity: 12,
      hp: { current: 39, max: 44, temp: 3 },
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
    },
  ],
};

describe('combat log export', () => {
  it('writes the roster and the log grouped by round', () => {
    const text = formatCombatLog('Cellar Ambush', state);
    expect(text).toContain('Combat log: Cellar Ambush');
    expect(text).toContain('Rounds: 2');
    expect(text).toContain('  Thora — ally, init 17, HP 39/44 (+3 temp)');
    expect(text).toContain('— Setup —');
    expect(text).toContain('— Round 1 —');
    expect(text).toMatch(/\d\d:\d\d:05 {2}Goblin hits Thora for 5/);
    expect(text.indexOf('— Round 1 —')).toBeLessThan(text.indexOf('— Round 2 —'));
  });

  it('formats a finished result with its kept log', () => {
    const text = formatResultLog('Cellar Ambush', {
      endedAt: '2026-09-28T19:30:00.000Z',
      rounds: 3,
      xpEarned: 150,
      casualties: [],
      log: [entry(1, 'Fight!')],
    });
    expect(text).toContain('XP earned: 150');
    expect(text).toContain('Casualties: none');
    expect(text).toContain('Fight!');
  });

  it('builds a safe file name', () => {
    expect(logFileName('Cellar Ambush: Part 2!', '2026-09-28T19:30:00.000Z')).toBe(
      'cellar-ambush-part-2-2026-09-28-log.txt',
    );
    expect(logFileName('', '2026-09-28T00:00:00.000Z')).toBe('combat-2026-09-28-log.txt');
  });
});
