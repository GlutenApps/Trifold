import { ulid } from 'ulid';
import { create } from 'zustand';
import {
  advanceTurn,
  applyDamage,
  applyDeathSave,
  applyHealing,
  compareInitiative,
  concentrationDc,
  damageMultiplier,
  grantTempHp,
  multiattackReferences,
  rewindTurn,
  rollAttack,
  rollD20,
  rollInitiative,
  roll as rollDice,
  type RollMode,
  type SavePrompt,
} from '@trifold/rules';
import type {
  Attack,
  Combatant,
  CombatState,
  CompendiumRecord,
  ConditionDuration,
  Encounter,
  Feature,
  LogEntry,
  PCCard,
  RollButton,
  SaveCall,
} from '@trifold/schema';
import { nowIso } from '@trifold/schema';
import { buildCombatants } from '../features/encounters/build';
import { facesText, useRollLogStore } from './rollLogStore';

/** A save call in progress: creature results auto-rolled, PC bonuses shown for the table. */
export interface SaveCallView {
  sourceName: string;
  featureName: string;
  ability: string;
  dc: number;
  halfOnSuccess: boolean;
  creatures: Array<{ id: string; name: string; total: number; natural: number; success: boolean }>;
  pcs: Array<{ id: string; name: string; bonus: number }>;
}

interface CombatStoreState {
  encounterId: string | null;
  state: CombatState | null;
  records: Record<string, CompendiumRecord>;
  selectedId: string | null;
  rollMode: RollMode;
  missing: string[];
  savePrompts: SavePrompt[];
  saveCall: SaveCallView | null;
  concentrationPrompt: { combatantId: string; name: string; dc: number } | null;
  /** XP total of enemy templates, for the encounter result. */
  enemyXp: number;
  error: string | null;

  begin(
    encounter: Encounter,
    pcs: PCCard[],
    initiativeMode: 'perGroup' | 'perCreature',
  ): Promise<void>;
  resume(encounter: Encounter): Promise<void>;
  leave(): void;
  setRollMode(mode: RollMode): void;
  select(id: string | null): void;
  setInitiative(id: string, value: number | null): void;
  rollInitiativeFor(id: string): void;
  rollMissingInitiatives(): void;
  sortByInitiative(): void;
  next(): void;
  previous(): void;
  damage(id: string, amount: number, type?: string): void;
  heal(id: string, amount: number): void;
  tempHp(id: string, amount: number): void;
  addCondition(id: string, name: string, duration?: ConditionDuration, level?: number): void;
  removeCondition(id: string, conditionId: string): void;
  setConcentration(id: string, on: string | null): void;
  dismissConcentration(): void;
  dismissSavePrompt(index: number): void;
  deathSave(id: string): void;
  toggleHeld(id: string): void;
  toggleHidden(id: string): void;
  reveal(id: string): void;
  markDead(id: string, dead: boolean): void;
  remove(id: string): void;
  move(id: string, direction: -1 | 1): void;
  useCounter(id: string, counterId: string, delta: number): void;
  spendRecharge(id: string, rechargeId: string): void;
  rollAttackFor(id: string, feature: Feature, attack: Attack): void;
  rollFeature(id: string, feature: Feature, button: RollButton): void;
  rollMultiattack(id: string, feature: Feature): void;
  callSave(id: string, feature: Feature, save: SaveCall): void;
  applySaveDamage(amount: number, type: string | undefined): void;
  clearSaveCall(): void;
  addLog(kind: LogEntry['kind'], text: string, actorId?: string): void;
  end(): Promise<{
    endedAt: string;
    xpEarned: number;
    rounds: number;
    casualties: string[];
  } | null>;
}

const LOG_LIMIT = 2000;
let saveTimer: number | null = null;

export const useCombatStore = create<CombatStoreState>((set, get) => {
  const persist = () => {
    const { encounterId, state } = get();
    if (!encounterId) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      window.trifold.encounters.saveState(encounterId, state).catch((err: unknown) => {
        set({ error: err instanceof Error ? err.message : String(err) });
      });
    }, 250);
  };

  const update = (fn: (state: CombatState) => CombatState) => {
    const state = get().state;
    if (!state) return;
    set({ state: fn(state) });
    persist();
  };

  const patchCombatant = (id: string, fn: (c: Combatant) => Combatant) =>
    update((s) => ({ ...s, combatants: s.combatants.map((c) => (c.id === id ? fn(c) : c)) }));

  const find = (id: string): Combatant | undefined =>
    get().state?.combatants.find((c) => c.id === id);

  const log = (
    kind: LogEntry['kind'],
    text: string,
    actorId?: string,
    detail?: Record<string, unknown>,
  ) => {
    update((s) => ({
      ...s,
      log: [
        ...s.log.slice(-(LOG_LIMIT - 1)),
        {
          id: ulid(),
          at: nowIso(),
          round: s.round,
          kind,
          text,
          ...(actorId ? { actorId } : {}),
          ...(detail ? { detail } : {}),
        },
      ],
    }));
  };

  const loadRecords = async (state: CombatState | null, encounter: Encounter) => {
    const ids = new Set<string>();
    for (const t of encounter.combatants) if (t.ref.kind === 'record') ids.add(t.ref.ref.recordId);
    for (const c of state?.combatants ?? []) if (c.recordId) ids.add(c.recordId);
    const records: Record<string, CompendiumRecord> = {};
    await Promise.all(
      [...ids].map(async (id) => {
        const r = await window.trifold.compendium.get(id).catch(() => null);
        if (r) records[id] = r;
        else {
          const t = encounter.combatants.find(
            (x) => x.ref.kind === 'record' && x.ref.ref.recordId === id,
          );
          if (t?.ref.kind === 'record') {
            const alt = await window.trifold.compendium
              .findByKey('monster', t.ref.ref.key)
              .catch(() => []);
            const match =
              alt.find((a) => t.ref.kind === 'record' && a.edition === t.ref.ref.edition) ?? alt[0];
            if (match) records[id] = match;
          }
        }
      }),
    );
    return records;
  };

  const enemyXpOf = (encounter: Encounter) =>
    encounter.combatants
      .filter((t) => t.role === 'enemy')
      .reduce((sum, t) => sum + (t.cache?.xp ?? 0) * t.quantity, 0);

  return {
    encounterId: null,
    state: null,
    records: {},
    selectedId: null,
    rollMode: 'normal',
    missing: [],
    savePrompts: [],
    saveCall: null,
    concentrationPrompt: null,
    enemyXp: 0,
    error: null,

    async begin(encounter, pcs, initiativeMode) {
      const records = await loadRecords(null, encounter);
      const map = new Map(Object.entries(records));
      const built = buildCombatants(encounter, pcs, map, { initiativeMode });
      const state: CombatState = {
        round: 0,
        turnIndex: -1,
        combatants: [...built.combatants].sort((a, b) =>
          compareInitiative(
            {
              initiative: a.initiative,
              dexterity: a.dexterity,
              order: built.combatants.indexOf(a),
              isLair: a.isLair,
            },
            {
              initiative: b.initiative,
              dexterity: b.dexterity,
              order: built.combatants.indexOf(b),
              isLair: b.isLair,
            },
          ),
        ),
        log: [],
        ...(built.hasLair ? { lairInitiative: 20 } : {}),
        startedAt: nowIso(),
      };
      set({
        encounterId: encounter.id,
        state,
        records,
        missing: built.missing,
        selectedId: state.combatants[0]?.id ?? null,
        savePrompts: [],
        saveCall: null,
        concentrationPrompt: null,
        enemyXp: enemyXpOf(encounter),
        error: null,
      });
      log('note', `Combat prepared: ${state.combatants.length} combatants`);
    },

    async resume(encounter) {
      if (!encounter.state) return;
      const records = await loadRecords(encounter.state, encounter);
      set({
        encounterId: encounter.id,
        state: encounter.state,
        records,
        missing: [],
        selectedId:
          encounter.state.combatants[encounter.state.turnIndex]?.id ??
          encounter.state.combatants[0]?.id ??
          null,
        savePrompts: [],
        saveCall: null,
        concentrationPrompt: null,
        enemyXp: enemyXpOf(encounter),
        error: null,
      });
    },

    leave() {
      set({
        encounterId: null,
        state: null,
        records: {},
        selectedId: null,
        savePrompts: [],
        saveCall: null,
        concentrationPrompt: null,
      });
    },

    setRollMode(mode) {
      set({ rollMode: mode });
    },

    select(id) {
      set({ selectedId: id });
    },

    setInitiative(id, value) {
      patchCombatant(id, (c) => ({ ...c, initiative: value }));
    },

    rollInitiativeFor(id) {
      const c = find(id);
      if (!c) return;
      const surprised = c.conditions.some((x) => /^surprised$/i.test(x.name));
      const value = rollInitiative(c.initiativeBonus, surprised ? 'disadvantage' : 'normal');
      patchCombatant(id, (x) => ({ ...x, initiative: value }));
      log(
        'roll',
        `${c.name} rolls initiative: ${value}${surprised ? ' (surprised, disadvantage)' : ''}`,
        id,
      );
    },

    rollMissingInitiatives() {
      for (const c of get().state?.combatants ?? [])
        if (c.initiative === null) get().rollInitiativeFor(c.id);
    },

    sortByInitiative() {
      update((s) => {
        const active = s.combatants[s.turnIndex]?.id;
        const sorted = [...s.combatants].sort((a, b) =>
          compareInitiative(
            {
              initiative: a.initiative,
              dexterity: a.dexterity,
              order: s.combatants.indexOf(a),
              isLair: a.isLair,
            },
            {
              initiative: b.initiative,
              dexterity: b.dexterity,
              order: s.combatants.indexOf(b),
              isLair: b.isLair,
            },
          ),
        );
        const turnIndex = active ? sorted.findIndex((c) => c.id === active) : s.turnIndex;
        return { ...s, combatants: sorted, turnIndex };
      });
    },

    next() {
      const s = get().state;
      if (!s) return;
      const result = advanceTurn(s);
      set({
        state: { ...s, ...result.state },
        savePrompts: [...get().savePrompts, ...result.savePrompts],
        selectedId: result.state.combatants[result.state.turnIndex]?.id ?? get().selectedId,
      });
      persist();
      for (const e of result.events)
        log(e.kind === 'turn' ? 'turn' : 'condition', e.text, e.combatantId || undefined);
    },

    previous() {
      update((s) => ({ ...s, ...rewindTurn(s) }));
      const s = get().state;
      const active = s?.combatants[s.turnIndex];
      if (active) set({ selectedId: active.id });
    },

    damage(id, amount, type) {
      const c = find(id);
      if (!c || amount <= 0) return;
      const mult = damageMultiplier(type, {
        vulnerabilities: c.damageVulnerabilities,
        resistances: c.damageResistances,
        immunities: c.damageImmunities,
      });
      const outcome = applyDamage(c.hp, amount, mult.multiplier);
      const isPc = c.ref.kind === 'pc';
      const droppedTo0 = outcome.hp.current === 0 && c.hp.current > 0;
      patchCombatant(id, (x) => ({
        ...x,
        hp: outcome.hp,
        ...(droppedTo0 && isPc ? { deathSaves: { successes: 0, failures: 0 } } : {}),
        ...(droppedTo0 && !isPc ? { dead: true } : {}),
        ...(droppedTo0 ? { concentrating: null } : {}),
      }));
      const why =
        mult.reason === 'normal'
          ? ''
          : ` (${mult.reason}${mult.qualified ? ', qualified' : ''} → ${outcome.adjusted})`;
      log(
        'damage',
        `${c.name} takes ${amount}${type ? ` ${type}` : ''} damage${why}${outcome.absorbedByTemp ? `, ${outcome.absorbedByTemp} absorbed by temp HP` : ''} → ${outcome.hp.current}/${outcome.hp.max}${droppedTo0 ? (isPc ? ' — down!' : ' — dead') : ''}${outcome.massive ? ' (massive damage: instant death if it exceeded max HP)' : ''}`,
        id,
      );
      if (c.concentrating && outcome.dealt + outcome.absorbedByTemp > 0 && !droppedTo0) {
        set({
          concentrationPrompt: {
            combatantId: id,
            name: c.name,
            dc: concentrationDc(outcome.adjusted),
          },
        });
      }
    },

    heal(id, amount) {
      const c = find(id);
      if (!c || amount <= 0) return;
      const hp = applyHealing(c.hp, amount);
      patchCombatant(id, (x) => ({ ...x, hp, dead: false, deathSaves: null }));
      log('heal', `${c.name} regains ${amount} HP → ${hp.current}/${hp.max}`, id);
    },

    tempHp(id, amount) {
      const c = find(id);
      if (!c || amount <= 0) return;
      patchCombatant(id, (x) => ({ ...x, hp: grantTempHp(x.hp, amount) }));
      log('heal', `${c.name} gains ${amount} temporary HP`, id);
    },

    addCondition(id, name, duration, level) {
      const c = find(id);
      if (!c) return;
      const immune = c.conditionImmunities.some((x) => x.toLowerCase() === name.toLowerCase());
      patchCombatant(id, (x) => ({
        ...x,
        conditions: [
          ...x.conditions.filter(
            (k) =>
              !(k.name.toLowerCase() === name.toLowerCase() && name.toLowerCase() === 'exhaustion'),
          ),
          {
            id: ulid(),
            name,
            ...(level ? { level } : {}),
            ...(duration ? { duration } : {}),
            appliedRound: get().state?.round ?? 0,
          },
        ],
      }));
      log(
        'condition',
        `${c.name}: ${name}${level ? ` ${level}` : ''} applied${immune ? ' (immune to this condition!)' : ''}`,
        id,
      );
    },

    removeCondition(id, conditionId) {
      const c = find(id);
      const cond = c?.conditions.find((x) => x.id === conditionId);
      patchCombatant(id, (x) => ({
        ...x,
        conditions: x.conditions.filter((k) => k.id !== conditionId),
      }));
      if (c && cond) log('condition', `${c.name}: ${cond.name} removed`, id);
    },

    setConcentration(id, on) {
      const c = find(id);
      if (!c) return;
      patchCombatant(id, (x) => ({
        ...x,
        concentrating: on ? { on, since: get().state?.round ?? 0 } : null,
      }));
      log('note', on ? `${c.name} concentrates on ${on}` : `${c.name} stops concentrating`, id);
    },

    dismissConcentration() {
      set({ concentrationPrompt: null });
    },

    dismissSavePrompt(index) {
      set({ savePrompts: get().savePrompts.filter((_, i) => i !== index) });
    },

    deathSave(id) {
      const c = find(id);
      if (!c || !c.deathSaves) return;
      const natural = rollD20(0).natural;
      const outcome = applyDeathSave(c.deathSaves, natural);
      patchCombatant(id, (x) => ({
        ...x,
        deathSaves: outcome.revived || outcome.dead ? null : outcome.saves,
        ...(outcome.revived ? { hp: { ...x.hp, current: 1 } } : {}),
        dead: outcome.dead,
      }));
      log(
        'death',
        `${c.name} death save: ${natural} → ${outcome.revived ? 'natural 20, back up with 1 HP' : outcome.dead ? 'dead' : outcome.stable ? 'stable' : `${outcome.saves.successes} successes, ${outcome.saves.failures} failures`}`,
        id,
      );
    },

    toggleHeld(id) {
      const c = find(id);
      patchCombatant(id, (x) => ({ ...x, held: !x.held }));
      if (c) log('note', `${c.name} ${c.held ? 'acts' : 'holds'}`, id);
    },

    toggleHidden(id) {
      patchCombatant(id, (x) => ({ ...x, hidden: !x.hidden }));
    },

    reveal(id) {
      patchCombatant(id, (x) => ({ ...x, revealed: true }));
    },

    markDead(id, dead) {
      const c = find(id);
      patchCombatant(id, (x) => ({
        ...x,
        dead,
        ...(dead ? { deathSaves: null, concentrating: null } : {}),
      }));
      if (c) log('death', `${c.name} marked ${dead ? 'dead' : 'alive'}`, id);
    },

    remove(id) {
      update((s) => {
        const index = s.combatants.findIndex((c) => c.id === id);
        const combatants = s.combatants.filter((c) => c.id !== id);
        let turnIndex = s.turnIndex;
        if (index !== -1 && index < turnIndex) turnIndex -= 1;
        if (turnIndex >= combatants.length) turnIndex = combatants.length - 1;
        return { ...s, combatants, turnIndex };
      });
    },

    move(id, direction) {
      update((s) => {
        const i = s.combatants.findIndex((c) => c.id === id);
        const j = i + direction;
        if (i === -1 || j < 0 || j >= s.combatants.length) return s;
        const combatants = [...s.combatants];
        [combatants[i], combatants[j]] = [combatants[j]!, combatants[i]!];
        const active = s.combatants[s.turnIndex]?.id;
        return {
          ...s,
          combatants,
          turnIndex: active ? combatants.findIndex((c) => c.id === active) : s.turnIndex,
        };
      });
    },

    useCounter(id, counterId, delta) {
      patchCombatant(id, (x) => ({
        ...x,
        counters: x.counters.map((k) =>
          k.id === counterId
            ? { ...k, current: Math.max(0, Math.min(k.max, k.current + delta)) }
            : k,
        ),
      }));
    },

    spendRecharge(id, rechargeId) {
      const c = find(id);
      const r = c?.recharges.find((x) => x.id === rechargeId);
      patchCombatant(id, (x) => ({
        ...x,
        recharges: x.recharges.map((k) => (k.id === rechargeId ? { ...k, available: false } : k)),
      }));
      if (c && r) log('note', `${c.name} uses ${r.featureName}`, id);
    },

    rollAttackFor(id, feature, attack) {
      const c = find(id);
      if (!c) return;
      const result = rollAttack(attack, get().rollMode);
      const hit = result.toHit;
      const parts: string[] = [];
      if (attack.toHit !== undefined) {
        parts.push(
          `to hit ${hit.total} (d20 ${hit.faces.join('/')}${hit.modifier ? ` ${hit.modifier >= 0 ? '+' : ''}${hit.modifier}` : ''})${result.crit ? ' CRIT' : result.fumble ? ' natural 1' : ''}`,
        );
      }
      if (result.damage)
        parts.push(
          `${result.damage.total} ${attack.damageType ?? ''} damage (${facesText(result.damage)}${result.damage.crit ? ', dice doubled' : ''})`.replace(
            '  ',
            ' ',
          ),
        );
      for (const x of result.extraDamage)
        parts.push(`+${x.total} ${x.damageType ?? ''} (${facesText(x)})`);
      const text = `${c.name} — ${feature.displayName} [${attack.label}]: ${parts.join('; ')}`;
      log('attack', text, id);
      useRollLogStore.getState().add({
        kind: 'attack',
        label: `${feature.displayName} (${c.name})`,
        expression: attack.damage ?? 'd20',
        total: result.damage?.total ?? hit.total,
        faces: parts.join('; '),
        actor: c.name,
      });
    },

    rollFeature(id, feature, button) {
      const c = find(id);
      if (!c) return;
      const result = rollDice(button.dice);
      log(
        'roll',
        `${c.name} — ${feature.displayName} [${button.label}]: ${result.total} (${facesText(result)})`,
        id,
      );
      useRollLogStore.getState().add({
        kind: 'dice',
        label: `${button.label} (${c.name})`,
        expression: button.dice,
        total: result.total,
        faces: facesText(result),
        actor: c.name,
      });
    },

    rollMultiattack(id, feature) {
      const c = find(id);
      const record = c?.recordId ? get().records[c.recordId] : undefined;
      if (!c || !record || record.kind !== 'monster') return;
      const all = [...record.data.actions, ...record.data.bonusActions];
      const names = multiattackReferences(
        feature.text,
        all.map((f) => f.displayName),
      );
      if (names.length === 0) {
        log('note', `${c.name} — Multiattack: no attack names recognised in the text`, id);
        return;
      }
      for (const name of names) {
        const f = all.find((x) => x.displayName === name);
        if (!f) continue;
        for (const a of f.attacks) get().rollAttackFor(id, f, a);
      }
    },

    callSave(id, feature, save) {
      const s = get().state;
      const source = find(id);
      if (!s || !source) return;
      const creatures: SaveCallView['creatures'] = [];
      const pcs: SaveCallView['pcs'] = [];
      for (const c of s.combatants) {
        if (c.id === id || c.isLair || c.dead) continue;
        if (c.ref.kind === 'pc') {
          pcs.push({ id: c.id, name: c.name, bonus: c.saves[save.ability] ?? 0 });
        } else {
          const bonus = c.saves[save.ability] ?? 0;
          const d20 = rollD20(bonus);
          creatures.push({
            id: c.id,
            name: c.name,
            total: d20.total,
            natural: d20.natural,
            success: d20.total >= save.dc,
          });
        }
      }
      set({
        saveCall: {
          sourceName: source.name,
          featureName: feature.displayName,
          ability: save.ability,
          dc: save.dc,
          halfOnSuccess: save.halfOnSuccess ?? false,
          creatures,
          pcs,
        },
      });
      log(
        'save',
        `${source.name} — ${feature.displayName}: DC ${save.dc} ${save.ability.toUpperCase()} save called${creatures.length ? `; creatures: ${creatures.map((x) => `${x.name} ${x.total}${x.success ? ' ✓' : ' ✗'}`).join(', ')}` : ''}`,
        id,
      );
    },

    applySaveDamage(amount, type) {
      const call = get().saveCall;
      if (!call || amount <= 0) return;
      for (const c of call.creatures) {
        if (c.success && !call.halfOnSuccess) continue;
        get().damage(c.id, c.success ? Math.floor(amount / 2) : amount, type);
      }
    },

    clearSaveCall() {
      set({ saveCall: null });
    },

    addLog(kind, text, actorId) {
      log(kind, text, actorId);
    },

    async end() {
      const { encounterId, state, enemyXp } = get();
      if (!encounterId || !state) return null;
      if (saveTimer) window.clearTimeout(saveTimer);
      const casualties = state.combatants
        .filter((c) => c.ref.kind === 'pc' && c.dead)
        .map((c) => c.name);
      const result = { endedAt: nowIso(), rounds: state.round, xpEarned: enemyXp, casualties };
      try {
        await window.trifold.encounters.finish(encounterId, result);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
      get().leave();
      return result;
    },
  };
});
