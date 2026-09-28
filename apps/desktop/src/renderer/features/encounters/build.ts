import { ulid } from 'ulid';
import {
  abilityModifier,
  maskedNameFor,
  numberedNames,
  rollInitiative,
  type Rng,
} from '@trifold/rules';
import type {
  Combatant,
  CombatantTemplate,
  CompendiumRecord,
  Counter,
  Encounter,
  Feature,
  MonsterRecord,
  PCCard,
  RechargeState,
} from '@trifold/schema';

/** Builds the initial combatant list from an encounter (DESIGN.md §6.4 "Starting combat"). */

export interface BuildOptions {
  initiativeMode: 'perGroup' | 'perCreature';
  rng?: Rng;
}

export interface BuildResult {
  combatants: Combatant[];
  /** Templates whose record could not be found; they become custom combatants with cached values. */
  missing: string[];
  hasLair: boolean;
}

const RESETS: Record<string, Counter['resets']> = {
  day: 'day',
  turn: 'turn',
  shortRest: 'shortRest',
  longRest: 'longRest',
  rest: 'shortRest',
};

export function countersFromMonster(record: MonsterRecord): {
  counters: Counter[];
  recharges: RechargeState[];
} {
  const d = record.data;
  const counters: Counter[] = [];
  const recharges: RechargeState[] = [];
  if (d.legendary.perTurn) {
    counters.push({
      id: ulid(),
      name: 'Legendary actions',
      max: d.legendary.perTurn,
      current: d.legendary.perTurn,
      resets: 'turn',
      kind: 'legendary',
    });
  }
  const features: Feature[] = [
    ...d.traits,
    ...d.actions,
    ...d.bonusActions,
    ...d.reactions,
    ...d.legendary.actions,
  ];
  for (const f of features) {
    if (f.uses && f.uses.per !== 'turn') {
      counters.push({
        id: ulid(),
        name: f.displayName,
        max: f.uses.count,
        current: f.uses.count,
        resets: RESETS[f.uses.per] ?? 'never',
        kind: /legendary resistance/i.test(f.displayName) ? 'legendaryResistance' : 'uses',
        featureName: f.name,
      });
    }
    if (f.recharge) {
      recharges.push({ id: ulid(), featureName: f.name, min: f.recharge.min, available: true });
    }
  }
  return { counters, recharges };
}

export function combatantFromPc(pc: PCCard, template?: CombatantTemplate): Combatant {
  return {
    id: ulid(),
    ...(template ? { templateId: template.id } : {}),
    name: template?.label || pc.name,
    maskedName: pc.name,
    revealed: true,
    ref: { kind: 'pc', pcId: pc.id, name: pc.name },
    role: template?.role ?? 'ally',
    initiative: null,
    initiativeBonus: pc.initiativeBonus,
    dexterity: 10 + pc.initiativeBonus * 2,
    hp: {
      current: template?.hpOverride ?? pc.maxHp,
      max: template?.hpOverride ?? pc.maxHp,
      temp: 0,
    },
    ac: pc.ac,
    saves: pc.saves,
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
    hidden: template?.hidden ?? false,
    held: false,
    isLair: false,
    ...(template?.tokenId ? { tokenId: template.tokenId } : {}),
  };
}

export function combatantFromMonster(
  record: MonsterRecord,
  template: CombatantTemplate,
  name: string,
  initiative: number | null,
): Combatant {
  const d = record.data;
  const max = template.hpOverride ?? d.hp?.average ?? 1;
  const { counters, recharges } = countersFromMonster(record);
  return {
    id: ulid(),
    templateId: template.id,
    name,
    maskedName: maskedNameFor(d.type),
    revealed: false,
    ref: template.ref,
    role: template.role,
    initiative,
    initiativeBonus: d.initiativeBonus ?? abilityModifier(d.abilities.dex),
    dexterity: d.abilities.dex,
    hp: { current: max, max, temp: 0 },
    ...(d.ac ? { ac: d.ac.value } : {}),
    saves: d.saves,
    damageVulnerabilities: d.damageVulnerabilities,
    damageResistances: d.damageResistances,
    damageImmunities: d.damageImmunities,
    conditionImmunities: d.conditionImmunities,
    conditions: [],
    concentrating: null,
    counters,
    recharges,
    deathSaves: null,
    dead: false,
    hidden: template.hidden,
    held: false,
    isLair: false,
    ...(template.tokenId ? { tokenId: template.tokenId } : {}),
    recordId: record.id,
  };
}

function customCombatant(template: CombatantTemplate, name: string): Combatant {
  const max = template.hpOverride ?? template.cache?.hp ?? 1;
  return {
    id: ulid(),
    templateId: template.id,
    name,
    maskedName: template.cache?.type ? maskedNameFor(template.cache.type) : 'Creature',
    revealed: false,
    ref: template.ref,
    role: template.role,
    initiative: null,
    initiativeBonus: 0,
    dexterity: 10,
    hp: { current: max, max, temp: 0 },
    ...(template.cache ? { ac: template.cache.ac } : {}),
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
    hidden: template.hidden,
    held: false,
    isLair: false,
  };
}

export function lairCombatant(): Combatant {
  return {
    id: ulid(),
    name: 'Lair actions',
    maskedName: 'Lair',
    revealed: true,
    ref: { kind: 'custom', name: 'Lair actions' },
    role: 'enemy',
    initiative: 20,
    initiativeBonus: 0,
    dexterity: 0,
    hp: { current: 0, max: 0, temp: 0 },
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
    isLair: true,
  };
}

/**
 * Expands templates into combatants. Creatures get their initiative rolled here (per group or
 * per creature); PCs start with null so the DM can enter what the players rolled.
 */
export function buildCombatants(
  encounter: Encounter,
  pcs: readonly PCCard[],
  records: ReadonlyMap<string, CompendiumRecord>,
  options: BuildOptions,
): BuildResult {
  const rng = options.rng ?? Math.random;
  const combatants: Combatant[] = [];
  const missing: string[] = [];
  let hasLair = false;

  for (const template of encounter.combatants) {
    const ref = template.ref;
    if (ref.kind === 'pc') {
      const pc = pcs.find((p) => p.id === ref.pcId);
      if (pc) combatants.push(combatantFromPc(pc, template));
      else missing.push(ref.name);
      continue;
    }
    const base = template.label || ref.name;
    const names = numberedNames(base, template.quantity);
    const record = ref.kind === 'record' ? records.get(ref.ref.recordId) : undefined;
    if (record && record.kind === 'monster') {
      if (record.data.lair.length > 0) hasLair = true;
      const bonus = record.data.initiativeBonus ?? abilityModifier(record.data.abilities.dex);
      const groupRoll =
        options.initiativeMode === 'perGroup' ? rollInitiative(bonus, 'normal', rng) : null;
      for (const name of names) {
        const initiative = groupRoll ?? rollInitiative(bonus, 'normal', rng);
        combatants.push(combatantFromMonster(record, template, name, initiative));
      }
    } else {
      if (ref.kind === 'record') missing.push(ref.name);
      for (const name of names) combatants.push(customCombatant(template, name));
    }
  }
  if (hasLair) combatants.push(lairCombatant());
  return { combatants, missing, hasLair };
}
