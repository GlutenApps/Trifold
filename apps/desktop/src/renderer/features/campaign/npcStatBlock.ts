import { normalizeKey } from '@trifold/rules';
import type {
  CombatantTemplate,
  CompendiumRecord,
  Encounter,
  MonsterRecord,
  NPC,
} from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { builderDraftFor } from '../encounters/builderDraft';
import { statBlockFate } from './npcRemoval';

/**
 * Editing an NPC's stat block from its own form (ADR 0039). The pencil opens one form: the NPC
 * first, its stat block below. On Save a changed stat block is written before the NPC:
 *
 * - one only this NPC uses in this campaign (the rule delete uses, ADR 0037) is updated in place;
 * - any other (SRD, a file, homebrew, or shared with another NPC) is copied into this campaign
 *   under the edited name, and the NPC is relinked to the copy. The original never changes.
 *
 * Its HP carried between fights (ADR 0012) follows a new stat block HP, keeping the same share of
 * damage, and the encounter rows holding the NPC take its new CR, XP, HP and AC.
 */

/** Whether a changed stat block is updated where it is, or copied into this campaign. */
export function editsInPlace(npc: NPC, campaign: { slug: string; npcs: readonly NPC[] }): boolean {
  return statBlockFate(npc, campaign).creatureId !== null;
}

/** The NPC's carried HP once its stat block's average HP moves: the same share of damage. */
export function hpAfterScale(hp: NPC['hp'], from: number, to: number): NPC['hp'] {
  if (!hp || from === to || to <= 0) return hp;
  if (hp.current >= hp.max) return { ...hp, current: to, max: to };
  const share = hp.max > 0 ? hp.current / hp.max : 1;
  return { ...hp, max: to, current: Math.max(0, Math.min(to, Math.round(share * to))) };
}

/** The calls a save makes, so tests can stand in for main. */
export interface StatBlockIo {
  draft(recordId: string): Promise<CompendiumRecord>;
  save(record: CompendiumRecord): Promise<CompendiumRecord>;
}

/**
 * Writes the edited stat block (in place or as this campaign's copy) and returns the NPC linked
 * to it with its HP brought along. `original` is the record the form opened.
 */
export async function saveStatBlock(
  npc: NPC,
  edit: { original: MonsterRecord; edited: MonsterRecord; inPlace: boolean },
  io: StatBlockIo,
): Promise<{ npc: NPC; record: MonsterRecord }> {
  const { original, edited } = edit;
  const name = edited.displayName.trim() || original.displayName;
  const named = { name, displayName: name, key: normalizeKey(name) };
  let saved: CompendiumRecord;
  if (edit.inPlace) {
    saved = await io.save({ ...edited, ...named });
  } else {
    const copy = await io.draft(original.id);
    saved = await io.save({
      ...copy,
      ...named,
      basedOn: original.basedOn ?? copy.basedOn,
      data: edited.data,
    } as CompendiumRecord);
  }
  if (saved.kind !== 'monster') throw new Error('The stat block was not saved as a creature');
  const hp = hpAfterScale(npc.hp, original.data.hp?.average ?? 0, saved.data.hp?.average ?? 0);
  return {
    record: saved,
    npc: {
      ...npc,
      recordRef: {
        recordId: saved.id,
        sourceId: saved.sourceId,
        key: saved.key,
        edition: saved.edition,
      },
      ...(hp ? { hp } : {}),
    },
  };
}

/** The numbers an encounter row shows for this NPC. */
export function npcRowCache(npc: NPC, record: MonsterRecord): CombatantTemplate['cache'] {
  return {
    xp: record.data.xp,
    cr: record.data.cr,
    type: record.data.type,
    hp: npc.hp?.max ?? record.data.hp?.average ?? 0,
    ac: record.data.ac?.value ?? 10,
  };
}

/** The rows holding this NPC with its new numbers; null when none does. */
export function withNpcCache(
  templates: readonly CombatantTemplate[],
  npc: NPC,
  record: MonsterRecord,
): CombatantTemplate[] | null {
  let changed = false;
  const next = templates.map((t) => {
    if (t.ref.kind !== 'npc' || t.ref.npcId !== npc.id) return t;
    changed = true;
    return { ...t, cache: npcRowCache(npc, record) };
  });
  return changed ? next : null;
}

/** Every encounter row holding the NPC takes its new numbers (the open builder's copy first). */
export async function refreshNpcRows(npc: NPC, record: MonsterRecord): Promise<void> {
  await flushPendingSaves();
  const campaign = useCampaignStore.getState();
  const fightId = useCombatStore.getState().encounterId;
  for (const e of campaign.current?.encounters ?? ([] as Encounter[])) {
    // The loaded fight saves its own encounter; its rows wait for the next edit there.
    if (e.id === fightId) continue;
    const builder = builderDraftFor(e.id);
    if (builder) {
      builder.editTemplates((ts) => withNpcCache(ts, npc, record) ?? ts);
      continue;
    }
    const combatants = withNpcCache(e.combatants, npc, record);
    if (combatants) await useCampaignStore.getState().saveEncounter({ ...e, combatants });
  }
}
