import type { Rng } from '../dice';

/**
 * Turn loop over a plain combatant shape (DESIGN.md §6.4). Pure: returns a new state plus the
 * events to log and any prompts for the DM. The tracker stores and renders the result.
 */

export interface TurnCondition {
  id: string;
  name: string;
  duration?:
    | { kind: 'rounds'; remaining: number }
    | { kind: 'untilStartOfTurn'; combatantId: string }
    | { kind: 'untilEndOfTurn'; combatantId: string }
    | { kind: 'untilSave'; ability: string; dc: number };
}

export interface TurnCounter {
  id: string;
  name: string;
  max: number;
  current: number;
  resets: 'turn' | 'shortRest' | 'longRest' | 'day' | 'never';
}

export interface TurnRecharge {
  id: string;
  featureName: string;
  min: number;
  available: boolean;
}

export interface TurnCombatant {
  id: string;
  name: string;
  dead: boolean;
  held: boolean;
  conditions: TurnCondition[];
  counters: TurnCounter[];
  recharges: TurnRecharge[];
}

export interface TurnState<C extends TurnCombatant> {
  round: number;
  turnIndex: number;
  combatants: C[];
}

export interface TurnEvent {
  kind: 'turn' | 'condition' | 'recharge' | 'counter';
  combatantId: string;
  text: string;
}

export interface SavePrompt {
  combatantId: string;
  conditionId: string;
  conditionName: string;
  ability: string;
  dc: number;
}

export interface TurnResult<C extends TurnCombatant> {
  state: TurnState<C>;
  events: TurnEvent[];
  /** "Save at end of turn" conditions on the combatant whose turn just ended. */
  savePrompts: SavePrompt[];
}

function nextActiveIndex<C extends TurnCombatant>(
  state: TurnState<C>,
  from: number,
  step: 1 | -1,
): number {
  const n = state.combatants.length;
  if (n === 0) return -1;
  let i = from;
  for (let tries = 0; tries < n; tries += 1) {
    i = (i + step + n) % n;
    const c = state.combatants[i];
    if (c && !c.dead && !c.held) return i;
  }
  return -1;
}

function endOfTurn<C extends TurnCombatant>(
  state: TurnState<C>,
  index: number,
): { state: TurnState<C>; events: TurnEvent[]; savePrompts: SavePrompt[] } {
  const events: TurnEvent[] = [];
  const savePrompts: SavePrompt[] = [];
  const ending = state.combatants[index];
  if (!ending) return { state, events, savePrompts };
  const combatants = state.combatants.map((c) => {
    const kept = c.conditions.filter((cond) => {
      const d = cond.duration;
      if (d?.kind === 'untilEndOfTurn' && d.combatantId === ending.id) {
        events.push({
          kind: 'condition',
          combatantId: c.id,
          text: `${c.name}: ${cond.name} ended`,
        });
        return false;
      }
      return true;
    });
    return kept.length === c.conditions.length ? c : { ...c, conditions: kept };
  });
  for (const cond of ending.conditions) {
    if (cond.duration?.kind === 'untilSave') {
      savePrompts.push({
        combatantId: ending.id,
        conditionId: cond.id,
        conditionName: cond.name,
        ability: cond.duration.ability,
        dc: cond.duration.dc,
      });
    }
  }
  return { state: { ...state, combatants }, events, savePrompts };
}

function startOfTurn<C extends TurnCombatant>(
  state: TurnState<C>,
  index: number,
  rng: Rng,
): { state: TurnState<C>; events: TurnEvent[] } {
  const events: TurnEvent[] = [];
  const active = state.combatants[index];
  if (!active) return { state, events };
  const combatants = state.combatants.map((c) => {
    let changed = false;
    // Conditions that end at the start of this combatant's turn, and round counters that tick
    // down on the affected combatant's own turn.
    const conditions = c.conditions
      .map((cond) => {
        const d = cond.duration;
        if (d?.kind === 'rounds' && c.id === active.id) {
          changed = true;
          return { ...cond, duration: { kind: 'rounds' as const, remaining: d.remaining - 1 } };
        }
        return cond;
      })
      .filter((cond) => {
        const d = cond.duration;
        const expired =
          (d?.kind === 'untilStartOfTurn' && d.combatantId === active.id) ||
          (d?.kind === 'rounds' && d.remaining <= 0 && c.id === active.id);
        if (expired) {
          changed = true;
          events.push({
            kind: 'condition',
            combatantId: c.id,
            text: `${c.name}: ${cond.name} ended`,
          });
        }
        return !expired;
      });
    if (c.id !== active.id) return changed ? { ...c, conditions } : c;

    const counters = c.counters.map((k) => {
      if (k.resets === 'turn' && k.current !== k.max) {
        events.push({
          kind: 'counter',
          combatantId: c.id,
          text: `${c.name}: ${k.name} reset to ${k.max}`,
        });
        return { ...k, current: k.max };
      }
      return k;
    });
    const recharges = c.recharges.map((r) => {
      if (r.available) return r;
      const face = 1 + Math.floor(rng() * 6);
      const available = face >= r.min;
      events.push({
        kind: 'recharge',
        combatantId: c.id,
        text: `${c.name}: ${r.featureName} recharge roll ${face} (needs ${r.min}+) — ${available ? 'available' : 'not yet'}`,
      });
      return available ? { ...r, available: true } : r;
    });
    return { ...c, conditions, counters, recharges };
  });
  events.unshift({ kind: 'turn', combatantId: active.id, text: `${active.name}'s turn` });
  return { state: { ...state, combatants }, events };
}

/** Advances to the next living, non-held combatant, wrapping into a new round. */
export function advanceTurn<C extends TurnCombatant>(
  state: TurnState<C>,
  rng: Rng = Math.random,
): TurnResult<C> {
  const events: TurnEvent[] = [];
  let savePrompts: SavePrompt[] = [];
  let next = state;
  if (state.turnIndex >= 0) {
    const ended = endOfTurn(state, state.turnIndex);
    next = ended.state;
    events.push(...ended.events);
    savePrompts = ended.savePrompts;
  }
  const index = nextActiveIndex(
    next,
    next.turnIndex < 0 ? next.combatants.length - 1 : next.turnIndex,
    1,
  );
  if (index === -1) return { state: next, events, savePrompts };
  const wrapped = next.turnIndex >= 0 && index <= next.turnIndex;
  const round =
    next.turnIndex < 0 ? Math.max(1, next.round) : wrapped ? next.round + 1 : next.round;
  if (wrapped || next.turnIndex < 0) {
    events.push({ kind: 'turn', combatantId: '', text: `Round ${round}` });
  }
  const started = startOfTurn({ ...next, round, turnIndex: index }, index, rng);
  return { state: started.state, events: [...events, ...started.events], savePrompts };
}

/** Steps back one turn without re-running start-of-turn effects. */
export function rewindTurn<C extends TurnCombatant>(state: TurnState<C>): TurnState<C> {
  if (state.turnIndex < 0) return state;
  const index = nextActiveIndex(state, state.turnIndex, -1);
  if (index === -1) return state;
  const wrapped = index >= state.turnIndex;
  return {
    ...state,
    turnIndex: index,
    round: wrapped ? Math.max(1, state.round - 1) : state.round,
  };
}
