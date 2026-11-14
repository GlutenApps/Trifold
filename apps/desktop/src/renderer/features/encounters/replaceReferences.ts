import type { Combatant, Encounter, Scene } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { builderDraftFor } from './builderDraft';
import {
  refersTo,
  replaceInCombatants,
  replaceInTemplates,
  replaceInTokens,
  type RecordIdentity,
  type RecordTarget,
} from './templates';

/**
 * Replace references (DESIGN.md §6.2, Beta 4): a homebrew copy takes its original's place across
 * the open campaign, or the original comes back. Encounter rows (every copy in them), running and
 * paused fights of those encounters (HP, conditions and turn order kept) and map tokens switch;
 * a row's label and HP override stay, they are the DM's per-encounter choices. Campaign NPCs keep
 * their stat block. The same call in reverse puts the original back.
 */

/** What a replace would change, counted for the confirm, and the edited copies to write. */
export interface ReplacePlan {
  /** Every encounter the replace edits: a row or a fighter in its fight uses the record. */
  encounters: Encounter[];
  /** Encounters with a row that uses it, and how many rows. */
  rowEncounters: number;
  rows: number;
  /** Running or paused fights with a fighter that uses it. */
  fights: number;
  scenes: Scene[];
  tokens: number;
}

/**
 * The replace, worked out without writing anything. `live` is the fight loaded in the tracker,
 * which is fresher than its encounter's saved state.
 */
export function planReplace(
  bundle: { encounters: readonly Encounter[]; scenes: readonly Scene[] },
  from: RecordIdentity,
  to: RecordTarget,
  live?: { encounterId: string; combatants: readonly Combatant[] } | null,
): ReplacePlan {
  const encounters: Encounter[] = [];
  let rows = 0;
  let rowEncounters = 0;
  let fights = 0;
  for (const e of bundle.encounters) {
    const used = e.combatants.filter((t) => refersTo(t.ref, from)).length;
    const fighters = live?.encounterId === e.id ? live.combatants : (e.state?.combatants ?? []);
    const inFight = fighters.some((c) => refersTo(c.ref, from));
    if (!used && !inFight) continue;
    rows += used;
    if (used) rowEncounters += 1;
    if (inFight) fights += 1;
    encounters.push({
      ...e,
      combatants: replaceInTemplates(e.combatants, from, to),
      ...(e.state
        ? { state: { ...e.state, combatants: replaceInCombatants(e.state.combatants, from, to) } }
        : {}),
    });
  }
  const scenes: Scene[] = [];
  let tokens = 0;
  for (const s of bundle.scenes) {
    const used = s.tokens.filter((t) => t.kind !== 'marker' && refersTo(t.ref, from)).length;
    if (!used) continue;
    tokens += used;
    scenes.push({ ...s, tokens: replaceInTokens(s.tokens, from, to) });
  }
  return { encounters, rowEncounters, rows, fights, scenes, tokens };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 encounters (5 rows), 1 fight and 4 tokens", or '' when nothing uses the record. */
export function describePlan(plan: ReplacePlan): string {
  const parts: string[] = [];
  if (plan.rowEncounters) {
    parts.push(
      `${plural(plan.rowEncounters, 'encounter')}${
        plan.rows > plan.rowEncounters ? ` (${plural(plan.rows, 'row')})` : ''
      }`,
    );
  }
  if (plan.fights) parts.push(plural(plan.fights, 'fight'));
  if (plan.tokens) parts.push(plural(plan.tokens, 'token'));
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The plan against the open campaign, with the tracker's fight as it is now. */
export function planInCampaign(from: RecordIdentity, to: RecordTarget): ReplacePlan | null {
  const current = useCampaignStore.getState().current;
  if (!current) return null;
  const { encounterId, state } = useCombatStore.getState();
  return planReplace(
    current,
    from,
    to,
    encounterId && state ? { encounterId, combatants: state.combatants } : null,
  );
}

/**
 * Carries out the replace in the open campaign: the tracker's fight through the combat store,
 * the builder's open encounter through its own copy, every other encounter and scene saved.
 * Resolves to what changed.
 */
export async function replaceInCampaign(
  from: RecordIdentity,
  to: RecordTarget,
): Promise<ReplacePlan | null> {
  // Edits waiting on a timer land first, so the replace builds on them.
  await flushPendingSaves();
  const plan = planInCampaign(from, to);
  if (!plan) return null;
  const combat = useCombatStore.getState();
  const campaign = useCampaignStore.getState();
  for (const encounter of plan.encounters) {
    if (combat.encounterId === encounter.id && combat.state) {
      combat.replaceRecord(from, to);
      continue;
    }
    const builder = builderDraftFor(encounter.id);
    if (builder) {
      builder.editTemplates((templates) => replaceInTemplates(templates, from, to));
      continue;
    }
    await campaign.saveEncounter(encounter);
  }
  for (const scene of plan.scenes) await useCampaignStore.getState().saveScene(scene);
  return plan;
}
