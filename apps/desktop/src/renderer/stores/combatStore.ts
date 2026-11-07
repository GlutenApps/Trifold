import { ulid } from 'ulid';
import { create } from 'zustand';
import {
  abilityModifier,
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
  numberedNames,
  rollInitiative,
  roll as rollDice,
  type RollMode,
  type SavePrompt,
} from '@trifold/rules';
import type {
  EncounterResult,
  Attack,
  Combatant,
  CombatantTemplate,
  CombatState,
  CompendiumRecord,
  ConditionDuration,
  Encounter,
  Feature,
  LogEntry,
  NPC,
  PCCard,
  RollButton,
  SaveCall,
  Token,
} from '@trifold/schema';
import { nowIso } from '@trifold/schema';
import {
  buildCombatants,
  combatantFromMonster,
  combatantFromNpc,
  combatantFromPc,
  customCombatant,
} from '../features/encounters/build';
import { retargetToNpc, withTokenLink } from '../features/encounters/templates';
import { autoLink, sceneInPlay, type TokenLink } from '../features/presenter/tokenLinks';
import { useCampaignStore } from './campaignStore';
import { usePresenterStore } from './presenterStore';
import { facesText, useRollLogStore } from './rollLogStore';
import { useSceneStore } from './sceneStore';

/** A save call in progress: creature results auto-rolled, PC bonuses shown for the table. */
export interface SaveCallView {
  id: string;
  sourceId: string;
  sourceName: string;
  featureName: string;
  ability: string;
  dc: number;
  halfOnSuccess: boolean;
  creatures: Array<{ id: string; name: string; total: number; natural: number; success: boolean }>;
  pcs: Array<{ id: string; name: string; bonus: number }>;
}

/** Damage rolled from a stat block, waiting for the DM to pick a target (or dismiss it). */
export interface PendingDamage {
  id: string;
  sourceId: string;
  sourceName: string;
  featureName: string;
  label: string;
  /** To-hit summary, absent for damage-only attacks. */
  hit?: { total: number; natural: number; crit: boolean; fumble: boolean };
  parts: Array<{ amount: number; type?: string }>;
}

/** One target of a damage assignment: the full amount or half of it (rounded down, per part). */
export interface DamageTarget {
  id: string;
  share: 'full' | 'half';
}

interface CombatStoreState {
  encounterId: string | null;
  state: CombatState | null;
  records: Record<string, CompendiumRecord>;
  selectedId: string | null;
  missing: string[];
  savePrompts: SavePrompt[];
  saveCall: SaveCallView | null;
  concentrationPrompt: { combatantId: string; name: string; dc: number } | null;
  pendingDamage: PendingDamage[];
  /** XP total of enemy templates, for the encounter result. */
  enemyXp: number;
  error: string | null;
  /** The Encounters tab shows its list over a running fight (ADR 0005). */
  browsing: boolean;
  /** The fight that just ended, shown once in the Encounters tab until dismissed. */
  finished: { encounterId: string; result: EncounterResult } | null;

  begin(
    encounter: Encounter,
    pcs: PCCard[],
    initiativeMode: 'perGroup' | 'perCreature',
  ): Promise<void>;
  resume(encounter: Encounter): Promise<void>;
  leave(): void;
  setBrowsing(browsing: boolean): void;
  dismissFinished(): void;
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
  /** Hidden and dead also reach the combatant's map token, so both views agree (ADR 0012). */
  toggleHidden(id: string): void;
  /** Shows the players the real name, or masks it again with `revealed: false`. */
  reveal(id: string, revealed?: boolean): void;
  markDead(id: string, dead: boolean): void;
  /** Ties a combatant to a map token (null unties); the fight's hidden and dead flags win. */
  linkToken(id: string, tokenId: string | null): void;
  /** Makes every link that needs no judgement between the fight and these tokens. */
  relinkTokens(tokens: readonly Token[]): void;
  /** Adds a fighter for a map token that matches no one in the fight, in initiative order. */
  addFromToken(token: Token): Promise<void>;
  /**
   * Adds a template's creatures, PC or NPC to the running fight in initiative order and keeps
   * it on the encounter; a PC or NPC already fighting is left alone.
   */
  addToFight(template: CombatantTemplate): Promise<void>;
  /** Turns a creature into a named NPC whose HP carries between fights. */
  trackAsNpc(id: string): Promise<NPC | null>;
  remove(id: string): void;
  move(id: string, direction: -1 | 1): void;
  useCounter(id: string, counterId: string, delta: number): void;
  spendRecharge(id: string, rechargeId: string): void;
  rollAttackFor(id: string, feature: Feature, attack: Attack, mode?: RollMode): void;
  /** Deals the parts to each target (halved per part for a half share) and logs who took what. */
  damageTargets(
    targets: DamageTarget[],
    parts: Array<{ amount: number; type?: string }>,
    source?: string,
  ): void;
  applyPendingDamage(pendingId: string, targets: DamageTarget[]): void;
  dismissPendingDamage(pendingId: string): void;
  rollFeature(id: string, feature: Feature, button: RollButton): void;
  rollMultiattack(id: string, feature: Feature, mode?: RollMode): void;
  callSave(id: string, feature: Feature, save: SaveCall): void;
  applySaveDamage(amount: number, type: string | undefined, targets: DamageTarget[]): void;
  clearSaveCall(): void;
  addLog(kind: LogEntry['kind'], text: string, actorId?: string): void;
  end(): Promise<EncounterResult | null>;
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

  /** The fight drives the map: a token follows its combatant's hidden and dead flags. */
  const syncToken = (c: Combatant) => {
    if (c.tokenId)
      useSceneStore.getState().patchTokenAnywhere(c.tokenId, { hidden: c.hidden, dead: c.dead });
  };

  const patchCombatant = (id: string, fn: (c: Combatant) => Combatant) => {
    let changed: Combatant | null = null;
    update((s) => ({
      ...s,
      combatants: s.combatants.map((c) => {
        if (c.id !== id) return c;
        const next = fn(c);
        if (next.tokenId && (next.hidden !== c.hidden || next.dead !== c.dead)) changed = next;
        return next;
      }),
    }));
    if (changed) syncToken(changed);
  };

  /** Where the running fight's tokens live: the live map, else the map the encounter sits on. */
  const mapInPlay = (encounter: Pick<Encounter, 'sceneId'> | null) =>
    sceneInPlay(
      useCampaignStore.getState().current?.scenes ?? [],
      usePresenterStore.getState().state.scene?.id ?? null,
      encounter,
    );

  const currentEncounter = (): Encounter | null => {
    const { encounterId } = get();
    return (
      useCampaignStore.getState().current?.encounters.find((e) => e.id === encounterId) ?? null
    );
  };

  /** Saves template edits made mid-fight with the live state, so nothing stale is written. */
  const saveTemplates = (combatants: Encounter['combatants']) => {
    const encounter = currentEncounter();
    if (!encounter) return;
    void useCampaignStore
      .getState()
      .saveEncounter({ ...encounter, combatants, state: get().state, updatedAt: nowIso() });
  };

  const rememberLinks = (links: readonly TokenLink[]) => {
    const encounter = currentEncounter();
    const combatants = get().state?.combatants ?? [];
    if (!encounter || links.length === 0) return;
    let templates = encounter.combatants;
    for (const link of links) {
      const c = combatants.find((x) => x.id === link.combatantId);
      if (c) templates = withTokenLink(templates, c, link.tokenId);
    }
    saveTemplates(templates);
  };

  const applyLinks = (links: readonly TokenLink[]) => {
    if (links.length === 0) return;
    const byCombatant = new Map(links.map((l) => [l.combatantId, l.tokenId]));
    const taken = new Set(links.map((l) => l.tokenId));
    update((s) => ({
      ...s,
      combatants: s.combatants.map((c) => {
        const tokenId = byCombatant.get(c.id);
        if (tokenId) return { ...c, tokenId };
        if (c.tokenId && taken.has(c.tokenId)) {
          const { tokenId: _moved, ...rest } = c;
          return rest;
        }
        return c;
      }),
    }));
    for (const c of get().state?.combatants ?? []) if (byCombatant.has(c.id)) syncToken(c);
    rememberLinks(links);
  };

  /**
   * Names for creatures joining a fight that may already hold some of the same: numbering
   * continues after the ones present, so a second pair of goblins becomes Goblin 3 and 4.
   */
  const namesFor = (base: string, quantity: number): string[] => {
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const numbered = new RegExp(`^${escaped} \\d+$`);
    const taken = (get().state?.combatants ?? []).filter(
      (c) => c.name === base || numbered.test(c.name),
    ).length;
    if (taken === 0) return numberedNames(base, quantity);
    return Array.from({ length: quantity }, (_, i) => `${base} ${taken + i + 1}`);
  };

  /** Combatants for a template added mid-fight, with their records fetched and cached. */
  const buildFor = async (template: CombatantTemplate): Promise<Combatant[]> => {
    const campaign = useCampaignStore.getState().current;
    const mode = campaign?.campaign.settings.initiativeMode ?? 'perGroup';
    const ref = template.ref;
    const fetchMonster = async (recordId: string) => {
      const found = await window.trifold.compendium.get(recordId).catch(() => null);
      if (found?.kind !== 'monster') return undefined;
      set({ records: { ...get().records, [found.id]: found } });
      return found;
    };
    if (ref.kind === 'pc') {
      const pc = campaign?.pcs.find((p) => p.id === ref.pcId);
      return pc ? [combatantFromPc(pc, template)] : [];
    }
    if (ref.kind === 'npc') {
      const npc = campaign?.npcs.find((n) => n.id === ref.npcId);
      if (!npc) return [];
      const record = npc.recordRef ? await fetchMonster(npc.recordRef.recordId) : undefined;
      const bonus = record
        ? (record.data.initiativeBonus ?? abilityModifier(record.data.abilities.dex))
        : 0;
      return [combatantFromNpc(npc, record, template, rollInitiative(bonus, 'normal'))];
    }
    const names = namesFor(template.label || ref.name, template.quantity);
    const record = ref.kind === 'record' ? await fetchMonster(ref.ref.recordId) : undefined;
    if (!record) return names.map((name) => customCombatant(template, name));
    const bonus = record.data.initiativeBonus ?? abilityModifier(record.data.abilities.dex);
    const groupRoll = mode === 'perGroup' ? rollInitiative(bonus, 'normal') : null;
    return names.map((name) =>
      combatantFromMonster(record, template, name, groupRoll ?? rollInitiative(bonus, 'normal')),
    );
  };

  /** Puts a newcomer where its initiative belongs without reordering anyone else. */
  const insertCombatant = (c: Combatant) => {
    update((s) => {
      const key = (x: Combatant, order: number) => ({
        initiative: x.initiative,
        dexterity: x.dexterity,
        order,
        isLair: x.isLair,
      });
      let at = s.combatants.length;
      if (c.initiative !== null) {
        const found = s.combatants.findIndex(
          (x, i) => compareInitiative(key(c, s.combatants.length), key(x, i)) < 0,
        );
        if (found !== -1) at = found;
      }
      const combatants = [...s.combatants];
      combatants.splice(at, 0, c);
      const turnIndex = s.turnIndex >= 0 && at <= s.turnIndex ? s.turnIndex + 1 : s.turnIndex;
      return { ...s, combatants, turnIndex };
    });
  };

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
    const npcs = useCampaignStore.getState().current?.npcs ?? [];
    for (const t of encounter.combatants) {
      if (t.ref.kind === 'record') ids.add(t.ref.ref.recordId);
      if (t.ref.kind === 'npc') {
        const npcId = t.ref.npcId;
        const recordId = npcs.find((n) => n.id === npcId)?.recordRef?.recordId;
        if (recordId) ids.add(recordId);
      }
    }
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
    missing: [],
    savePrompts: [],
    saveCall: null,
    concentrationPrompt: null,
    pendingDamage: [],
    enemyXp: 0,
    error: null,
    browsing: false,
    finished: null,

    async begin(encounter, pcs, initiativeMode) {
      const records = await loadRecords(null, encounter);
      const map = new Map(Object.entries(records));
      const npcs = useCampaignStore.getState().current?.npcs ?? [];
      const built = buildCombatants(encounter, pcs, map, { initiativeMode, npcs });
      // Tokens already on the map in play are the players' view at this moment: tie the fight
      // to them and start from what they show (ADR 0012). From here on the fight drives them.
      const tokens = mapInPlay(encounter)?.tokens ?? [];
      const links = autoLink(built.combatants, tokens);
      const linked = new Map(links.map((l) => [l.combatantId, l.tokenId]));
      built.combatants = built.combatants.map((c) => {
        const tokenId = linked.get(c.id) ?? c.tokenId;
        const token = tokenId ? tokens.find((t) => t.id === tokenId) : undefined;
        if (!token) return c;
        return { ...c, tokenId: token.id, hidden: token.hidden, dead: c.dead || token.dead };
      });
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
        browsing: false,
        finished: null,
      });
      log('note', `Combat prepared: ${state.combatants.length} combatants`);
      rememberLinks(links);
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
        browsing: false,
        finished: null,
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
        pendingDamage: [],
        browsing: false,
      });
    },

    setBrowsing(browsing) {
      set({ browsing });
    },

    dismissFinished() {
      set({ finished: null });
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

    reveal(id, revealed = true) {
      patchCombatant(id, (x) => ({ ...x, revealed }));
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

    linkToken(id, tokenId) {
      const c = find(id);
      if (!c) return;
      if (tokenId) {
        applyLinks([{ combatantId: id, tokenId }]);
        return;
      }
      if (!c.tokenId) return;
      update((s) => ({
        ...s,
        combatants: s.combatants.map((x) => {
          if (x.id !== id) return x;
          const { tokenId: _gone, ...rest } = x;
          return rest;
        }),
      }));
      const encounter = currentEncounter();
      if (encounter) saveTemplates(withTokenLink(encounter.combatants, c, null));
    },

    relinkTokens(tokens) {
      const s = get().state;
      if (!s) return;
      applyLinks(autoLink(s.combatants, tokens));
    },

    async addFromToken(token) {
      if (!get().state || token.kind === 'marker') return;
      const template: CombatantTemplate = {
        id: ulid(),
        ref: token.ref,
        label: token.label,
        quantity: 1,
        role: token.role,
        hidden: token.hidden,
        tokenId: token.id,
      };
      const built = await buildFor(template);
      for (const c of built) {
        const joined = { ...c, hidden: token.hidden, dead: c.dead || token.dead };
        insertCombatant(joined);
        log('note', `${joined.name} joins the fight`, joined.id);
      }
      const encounter = currentEncounter();
      if (encounter && built.length) saveTemplates([...encounter.combatants, template]);
    },

    async addToFight(template) {
      const s = get().state;
      if (!s) return;
      const present = (c: Combatant) =>
        (template.ref.kind === 'pc' && c.ref.kind === 'pc' && c.ref.pcId === template.ref.pcId) ||
        (template.ref.kind === 'npc' && c.ref.kind === 'npc' && c.ref.npcId === template.ref.npcId);
      if (s.combatants.some(present)) return;
      const built = await buildFor(template);
      for (const c of built) {
        insertCombatant(c);
        log('note', `${c.name} joins the fight`, c.id);
      }
      if (built.length === 0) return;
      const encounter = currentEncounter();
      if (encounter) saveTemplates([...encounter.combatants, template]);
      // A newcomer may already have a token waiting on the map in play.
      const tokens = mapInPlay(encounter)?.tokens ?? [];
      if (tokens.length) applyLinks(autoLink(get().state?.combatants ?? [], tokens));
    },

    async trackAsNpc(id) {
      const c = find(id);
      if (!c || c.isLair || c.ref.kind === 'pc' || c.ref.kind === 'npc') return null;
      const npc = await useCampaignStore.getState().saveNpc({
        schemaVersion: 1,
        id: '',
        name: c.name,
        ...(c.ref.kind === 'record' ? { recordRef: c.ref.ref } : {}),
        role: '',
        location: '',
        notes: '',
        isAlive: !c.dead,
        hp: { current: c.hp.current, max: c.hp.max, temp: c.hp.temp },
        createdAt: '',
        updatedAt: '',
      });
      if (!npc) return null;
      patchCombatant(id, (x) => ({ ...x, ref: { kind: 'npc', npcId: npc.id, name: npc.name } }));
      log('note', `${c.name} is now tracked as an NPC; HP carries to the next fight`, id);
      const encounter = currentEncounter();
      if (encounter)
        saveTemplates(retargetToNpc(encounter.combatants, c.templateId, npc, c.tokenId));
      return npc;
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

    rollAttackFor(id, feature, attack, mode = 'normal') {
      const c = find(id);
      if (!c) return;
      const result = rollAttack(attack, mode);
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
      const modeText = attack.toHit !== undefined && mode !== 'normal' ? ` with ${mode}` : '';
      const text = `${c.name} — ${feature.displayName} [${attack.label}]${modeText}: ${parts.join('; ')}`;
      log('attack', text, id);
      const damageParts: PendingDamage['parts'] = [];
      if (result.damage) {
        damageParts.push({
          amount: result.damage.total,
          ...(attack.damageType ? { type: attack.damageType } : {}),
        });
      }
      for (const x of result.extraDamage) {
        damageParts.push({ amount: x.total, ...(x.damageType ? { type: x.damageType } : {}) });
      }
      if (damageParts.length > 0) {
        const hitInfo =
          attack.toHit !== undefined
            ? {
                hit: {
                  total: hit.total,
                  natural: hit.natural,
                  crit: result.crit,
                  fumble: result.fumble,
                },
              }
            : {};
        set({
          pendingDamage: [
            ...get().pendingDamage,
            {
              id: ulid(),
              sourceId: id,
              sourceName: c.name,
              featureName: feature.displayName,
              label: attack.label,
              ...hitInfo,
              parts: damageParts,
            },
          ],
        });
      }
      useRollLogStore.getState().add({
        kind: 'attack',
        label: `${feature.displayName} (${c.name})`,
        expression: attack.damage ?? 'd20',
        total: result.damage?.total ?? hit.total,
        faces: parts.join('; '),
        actor: c.name,
        source: 'tracker',
        ...(get().encounterId ? { encounterId: get().encounterId! } : {}),
        ...(result.crit ? { outcome: 'crit' } : result.fumble ? { outcome: 'fumble' } : {}),
      });
    },

    damageTargets(targets, parts, source) {
      const names: string[] = [];
      for (const t of targets) {
        const target = find(t.id);
        if (!target) continue;
        for (const part of parts) {
          const amount = t.share === 'half' ? Math.floor(part.amount / 2) : part.amount;
          if (amount > 0) get().damage(t.id, amount, part.type);
        }
        names.push(`${target.name}${t.share === 'half' ? ' (halved)' : ''}`);
      }
      if (source && names.length > 0) log('note', `${source} applied to ${names.join(', ')}`);
    },

    applyPendingDamage(pendingId, targets) {
      const pending = get().pendingDamage.find((p) => p.id === pendingId);
      if (!pending) return;
      get().damageTargets(targets, pending.parts, `${pending.sourceName}'s ${pending.featureName}`);
      set({ pendingDamage: get().pendingDamage.filter((p) => p.id !== pendingId) });
    },

    dismissPendingDamage(pendingId) {
      set({ pendingDamage: get().pendingDamage.filter((p) => p.id !== pendingId) });
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
        source: 'tracker',
        ...(get().encounterId ? { encounterId: get().encounterId! } : {}),
      });
    },

    rollMultiattack(id, feature, mode = 'normal') {
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
        for (const a of f.attacks) get().rollAttackFor(id, f, a, mode);
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
          id: ulid(),
          sourceId: id,
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

    applySaveDamage(amount, type, targets) {
      const call = get().saveCall;
      if (!call || amount <= 0) return;
      get().damageTargets(
        targets,
        [{ amount, ...(type ? { type } : {}) }],
        `${call.sourceName}'s ${call.featureName}`,
      );
      set({ saveCall: null });
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
      if (saveTimer) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
      }
      const casualties = state.combatants
        .filter((c) => c.ref.kind === 'pc' && c.dead)
        .map((c) => c.name);
      const result: EncounterResult = {
        endedAt: nowIso(),
        rounds: state.round,
        xpEarned: enemyXp,
        casualties,
        log: state.log,
      };
      try {
        // The final state goes down first: finishing carries HP from it to PC cards and NPCs.
        await window.trifold.encounters.saveState(encounterId, state);
        await window.trifold.encounters.finish(encounterId, result);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
      get().leave();
      set({ finished: { encounterId, result } });
      return result;
    },
  };
});
