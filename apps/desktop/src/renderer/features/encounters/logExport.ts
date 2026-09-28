import type { CombatState, EncounterResult, LogEntry } from '@trifold/schema';

/** Plain-text combat log (DESIGN.md §6.4 "the log is exportable as text"). */

function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const two = (n: number) => n.toString().padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function formatLogLines(log: readonly LogEntry[]): string[] {
  const lines: string[] = [];
  let round = -1;
  for (const entry of log) {
    if (entry.round !== round) {
      round = entry.round;
      lines.push('', round === 0 ? '— Setup —' : `— Round ${round} —`);
    }
    lines.push(`${clock(entry.at)}  ${entry.text}`);
  }
  return lines;
}

/** A live or just-finished fight: roster, then the log in order. */
export function formatCombatLog(encounterName: string, state: CombatState): string {
  const roster = state.combatants
    .filter((c) => !c.isLair)
    .map((c) => {
      const hp = `${c.hp.current}/${c.hp.max}${c.hp.temp ? ` (+${c.hp.temp} temp)` : ''}`;
      const flags = [c.dead ? 'dead' : '', c.hidden ? 'hidden' : ''].filter(Boolean).join(', ');
      return `  ${c.name} — ${c.role}, init ${c.initiative ?? '?'}, HP ${hp}${flags ? ` [${flags}]` : ''}`;
    });
  return [
    `Combat log: ${encounterName}`,
    `Started ${dateLabel(state.startedAt)}`,
    `Rounds: ${state.round}`,
    '',
    'Combatants:',
    ...roster,
    ...formatLogLines(state.log),
    '',
  ].join('\n');
}

/** A finished fight kept on the encounter. */
export function formatResultLog(encounterName: string, result: EncounterResult): string {
  return [
    `Combat log: ${encounterName}`,
    `Ended ${dateLabel(result.endedAt)}`,
    `Rounds: ${result.rounds}`,
    `XP earned: ${result.xpEarned}`,
    `Casualties: ${result.casualties.length ? result.casualties.join(', ') : 'none'}`,
    ...formatLogLines(result.log),
    '',
  ].join('\n');
}

export function logFileName(encounterName: string, iso: string): string {
  const safe =
    encounterName
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'combat';
  return `${safe}-${iso.slice(0, 10)}-log.txt`;
}
