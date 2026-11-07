import { multiattackReferences, rollAttack, roll as rollDice, type RollMode } from '@trifold/rules';
import type { Attack, Feature, MonsterRecord } from '@trifold/schema';
import { facesText, useRollLogStore, type RollLogEntry } from '../../stores/rollLogStore';
import type { StatBlockActions } from './StatBlock';

/**
 * Rolls made from a stat block read outside a fight (DESIGN.md §6.1): they land in the shared
 * roll log with the record as the actor, and nothing is dealt or tracked. Saves stay inert here
 * because there is nobody to call them against; the tracker owns those.
 */

const log = (entry: Omit<RollLogEntry, 'id' | 'at' | 'source'>): RollLogEntry =>
  useRollLogStore.getState().add({ ...entry, source: 'compendium' });

export function logAttackRoll(
  actor: string,
  feature: Feature,
  attack: Attack,
  mode: RollMode = 'normal',
): RollLogEntry {
  const result = rollAttack(attack, mode);
  const hit = result.toHit;
  const parts: string[] = [];
  if (attack.toHit !== undefined) {
    const modifier = hit.modifier ? ` ${hit.modifier >= 0 ? '+' : ''}${hit.modifier}` : '';
    const outcome = result.crit ? ' CRIT' : result.fumble ? ' natural 1' : '';
    parts.push(`to hit ${hit.total} (d20 ${hit.faces.join('/')}${modifier})${outcome}`);
  }
  if (result.damage) {
    const type = attack.damageType ? ` ${attack.damageType}` : '';
    const doubled = result.damage.crit ? ', dice doubled' : '';
    parts.push(`${result.damage.total}${type} damage (${facesText(result.damage)}${doubled})`);
  }
  for (const x of result.extraDamage) {
    parts.push(`+${x.total}${x.damageType ? ` ${x.damageType}` : ''} (${facesText(x)})`);
  }
  const modeNote = attack.toHit !== undefined && mode !== 'normal' ? ` (${mode})` : '';
  return log({
    kind: 'attack',
    label: `${feature.displayName}${attack.label ? ` [${attack.label}]` : ''}${modeNote} (${actor})`,
    expression: attack.damage ?? 'd20',
    total: result.damage?.total ?? hit.total,
    faces: parts.join('; '),
    actor,
    ...(result.crit
      ? { outcome: 'crit' as const }
      : result.fumble
        ? { outcome: 'fumble' as const }
        : {}),
  });
}

/** A plain dice roll such as a spell's damage or a trait's `Heal||1d10` button. */
export function logDiceRoll(actor: string, label: string, dice: string): RollLogEntry {
  const result = rollDice(dice);
  return log({
    kind: 'dice',
    label: `${label} (${actor})`,
    expression: dice,
    total: result.total,
    faces: facesText(result),
    actor,
  });
}

/** Every attack the Multiattack text names, rolled in order; logs a note when none is found. */
export function logMultiattack(
  record: MonsterRecord,
  feature: Feature,
  mode: RollMode = 'normal',
): RollLogEntry[] {
  const all = [...record.data.actions, ...record.data.bonusActions];
  const names = multiattackReferences(
    feature.text,
    all.map((f) => f.displayName),
  );
  const entries: RollLogEntry[] = [];
  for (const name of names) {
    const f = all.find((x) => x.displayName === name);
    if (!f) continue;
    for (const a of f.attacks) entries.push(logAttackRoll(record.displayName, f, a, mode));
  }
  if (entries.length === 0) {
    entries.push(
      log({
        kind: 'other',
        label: `Multiattack: no attack names recognised in the text (${record.displayName})`,
        expression: '',
        total: 0,
        faces: '',
        actor: record.displayName,
      }),
    );
  }
  return entries;
}

/** The stat block's roll handlers for a record read in the compendium. */
export function compendiumActions(record: MonsterRecord): StatBlockActions {
  const actor = record.displayName;
  return {
    onAttack: (feature, attack, mode) => void logAttackRoll(actor, feature, attack, mode),
    onRoll: (feature, button) =>
      void logDiceRoll(actor, `${feature.displayName} [${button.label}]`, button.dice),
    onMultiattack: (feature, mode) => void logMultiattack(record, feature, mode),
  };
}
