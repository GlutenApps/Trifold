import type { Combatant, EntityRef, Encounter, NPC, Scene } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { builderDraftFor } from '../encounters/builderDraft';
import type { ReplacePlan } from '../encounters/replaceReferences';
import { withoutFighters } from '../encounters/templates';

/**
 * Deleting an NPC (ADR 0037): the NPC leaves this campaign's encounters, fights and maps, and a
 * stat block that is only this campaign's (one of its creatures, used by no other NPC) is
 * deleted with it. A stat block from the SRD, an imported file or homebrew is never touched.
 * The confirm says first where it is used.
 */

/** Whether a reference is to this NPC, or to the stat block being deleted with it. */
export type RefTest = (ref: EntityRef) => boolean;

export function usesOf(npcId: string, creatureId: string | null): RefTest {
  return (ref) =>
    (ref.kind === 'npc' && ref.npcId === npcId) ||
    (creatureId !== null && ref.kind === 'record' && ref.ref.recordId === creatureId);
}

/** What deleting an NPC does to its stat block. */
export interface StatBlockFate {
  /** The campaign creature deleted with it, or null. */
  creatureId: string | null;
  /** Another NPC in this campaign sharing that creature, which keeps it. */
  sharedWith: string | null;
}

export function statBlockFate(
  npc: NPC,
  campaign: { slug: string; npcs: readonly NPC[] },
): StatBlockFate {
  const ref = npc.recordRef;
  if (!ref || ref.sourceId !== `campaign:${campaign.slug}`) {
    return { creatureId: null, sharedWith: null };
  }
  const other = campaign.npcs.find(
    (n) => n.id !== npc.id && n.recordRef?.recordId === ref.recordId,
  );
  return other
    ? { creatureId: null, sharedWith: other.name }
    : { creatureId: ref.recordId, sharedWith: null };
}

/** Where it is used and the edited copies, counted like Replace references so one sentence says it. */
export function planRemoval(
  bundle: { encounters: readonly Encounter[]; scenes: readonly Scene[] },
  test: RefTest,
  live?: { encounterId: string; combatants: readonly Combatant[] } | null,
): ReplacePlan {
  const encounters: Encounter[] = [];
  let rows = 0;
  let rowEncounters = 0;
  let fights = 0;
  for (const e of bundle.encounters) {
    const used = e.combatants.filter((t) => test(t.ref)).length;
    const fighters = live?.encounterId === e.id ? live.combatants : (e.state?.combatants ?? []);
    const inFight = fighters.some((c) => test(c.ref));
    if (!used && !inFight) continue;
    rows += used;
    if (used) rowEncounters += 1;
    if (inFight) fights += 1;
    encounters.push({
      ...e,
      combatants: e.combatants.filter((t) => !test(t.ref)),
      ...(e.state ? { state: withoutFighters(e.state, test) } : {}),
    });
  }
  const scenes: Scene[] = [];
  let tokens = 0;
  for (const s of bundle.scenes) {
    const used = s.tokens.filter((t) => t.kind !== 'marker' && test(t.ref)).length;
    if (!used) continue;
    tokens += used;
    scenes.push({ ...s, tokens: s.tokens.filter((t) => t.kind === 'marker' || !test(t.ref)) });
  }
  return { encounters, rowEncounters, rows, fights, scenes, tokens };
}

/** The plan against the open campaign, with the tracker's fight as it is now. */
export function planNpcRemoval(npc: NPC): { plan: ReplacePlan; fate: StatBlockFate } | null {
  const current = useCampaignStore.getState().current;
  if (!current) return null;
  const fate = statBlockFate(npc, { slug: current.campaign.slug, npcs: current.npcs });
  const { encounterId, state } = useCombatStore.getState();
  const plan = planRemoval(
    current,
    usesOf(npc.id, fate.creatureId),
    encounterId && state ? { encounterId, combatants: state.combatants } : null,
  );
  return { plan, fate };
}

/**
 * Deletes the NPC from the open campaign: out of every encounter, fight and map first (the
 * tracker's fight through the combat store, the builder's open encounter through its copy),
 * then the NPC, then the stat block that was only this campaign's.
 */
export async function removeNpcEverywhere(npc: NPC): Promise<void> {
  await flushPendingSaves();
  const planned = planNpcRemoval(npc);
  if (!planned) return;
  const { plan, fate } = planned;
  const test = usesOf(npc.id, fate.creatureId);
  const combat = useCombatStore.getState();
  for (const encounter of plan.encounters) {
    if (combat.encounterId === encounter.id && combat.state) {
      combat.removeWhere(test);
      continue;
    }
    const builder = builderDraftFor(encounter.id);
    if (builder) {
      builder.editTemplates((templates) => templates.filter((t) => !test(t.ref)));
      continue;
    }
    await useCampaignStore.getState().saveEncounter(encounter);
  }
  for (const scene of plan.scenes) await useCampaignStore.getState().saveScene(scene);
  await useCampaignStore.getState().removeNpc(npc.id);
  if (fate.creatureId) await window.trifold.homebrew.remove(fate.creatureId);
}
