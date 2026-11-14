import { normalizeKey } from '@trifold/rules';
import type { CombatantTemplate, CompendiumRecord, Encounter } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { useShellStore } from '../../stores/shellStore';
import { builderDraftFor } from './builderDraft';
import { replaceInCampaign } from './replaceReferences';
import {
  retargetCombatants,
  retargetToRecord,
  templateTokenIds,
  type RecordIdentity,
  type RecordTarget,
} from './templates';

/**
 * Save to compendium (DESIGN.md §6.2, Beta 3). From an encounter row or a fighter in the tracker,
 * the creature's stat block is copied (not yet written) with the row's label as its name and its
 * HP override as its HP, and opened in the homebrew monster editor. Above the editor the DM picks
 * what Save does next:
 *
 * - **Use it in <encounter>** (the default): that row (every copy in it), the fight if it is
 *   running or paused, and the row's map tokens point at the new record.
 * - **Use it everywhere in <campaign>**: Replace references (Beta 4) runs for the original, in
 *   every encounter, fight and map of the open campaign.
 * - **Just save it**: the copy waits in homebrew.
 */

/** The saved record as an encounter row points at it, with the numbers the builder shows. */
export function recordTarget(record: CompendiumRecord): RecordTarget {
  const data = record.kind === 'monster' ? record.data : null;
  return {
    ref: {
      kind: 'record',
      ref: {
        recordId: record.id,
        sourceId: record.sourceId,
        key: record.key,
        edition: record.edition,
      },
      name: record.displayName,
    },
    cache: {
      xp: data?.xp ?? 0,
      cr: data?.cr ?? '',
      type: data?.type ?? '',
      hp: data?.hp?.average ?? 0,
      ac: data?.ac?.value ?? 10,
    },
  };
}

/**
 * The copy the editor opens: the row's label as its name when the DM gave one, else the copy's
 * own ("Copy of Goblin"), and the HP override as its average HP.
 */
export function draftFromRow(
  draft: CompendiumRecord,
  row: Pick<Encounter['combatants'][number], 'label' | 'hpOverride' | 'ref'>,
): CompendiumRecord {
  let out = draft;
  const label = row.label?.trim();
  if (label && normalizeKey(label) !== normalizeKey(row.ref.name)) {
    out = { ...out, name: label, displayName: label, key: normalizeKey(label) };
  }
  if (row.hpOverride && out.kind === 'monster') {
    // The formula no longer gives this average, so it goes; the editor can roll a new one.
    out = { ...out, data: { ...out.data, hp: { average: row.hpOverride } } };
  }
  return out;
}

/** Points the encounter row, its fight and its tokens at the saved record. */
export async function applySavedRecord(
  encounterId: string,
  templateId: string,
  saved: CompendiumRecord,
): Promise<void> {
  const target = recordTarget(saved);
  const builder = builderDraftFor(encounterId);
  // Edits waiting on a timer land first, so the switch builds on them.
  await flushPendingSaves();
  const campaign = useCampaignStore.getState();
  const encounter = campaign.current?.encounters.find((e) => e.id === encounterId);
  const row = encounter?.combatants.find((t) => t.id === templateId);
  if (!encounter || !row) return;

  const combat = useCombatStore.getState();
  if (combat.encounterId === encounterId && combat.state) {
    combat.retargetToRecord(templateId, target);
  } else if (builder) {
    builder.editTemplates((templates) => retargetToRecord(templates, templateId, target));
  } else {
    await campaign.saveEncounter({
      ...encounter,
      combatants: retargetToRecord(encounter.combatants, templateId, target),
      ...(encounter.state
        ? {
            state: {
              ...encounter.state,
              combatants: retargetCombatants(encounter.state.combatants, templateId, target),
            },
          }
        : {}),
    });
  }

  // The row's tokens follow, so a later link by identity finds the new record too.
  const tokenIds = new Set(templateTokenIds(row));
  if (tokenIds.size === 0) return;
  for (const scene of useCampaignStore.getState().current?.scenes ?? []) {
    if (!scene.tokens.some((t) => tokenIds.has(t.id) && t.ref.kind === 'record')) continue;
    await useCampaignStore.getState().saveScene({
      ...scene,
      tokens: scene.tokens.map((t) =>
        tokenIds.has(t.id) && t.ref.kind === 'record' ? { ...t, ref: target.ref } : t,
      ),
    });
  }
}

/**
 * Opens the copy in the compendium's editor, ready to save. `encounter` and `row` are what the
 * caller shows, so a label typed a moment ago in the builder is used.
 */
export async function saveToCompendium(
  encounter: Encounter,
  row: CombatantTemplate,
): Promise<void> {
  if (row.ref.kind !== 'record') return;
  const encounterId = encounter.id;
  const templateId = row.id;
  const original: RecordIdentity = {
    id: row.ref.ref.recordId,
    sourceId: row.ref.ref.sourceId,
    key: row.ref.ref.key,
  };
  let draft: CompendiumRecord;
  try {
    draft = draftFromRow(await window.trifold.homebrew.draft(original.id), row);
  } catch (err) {
    useCompendiumStore.setState({ error: err instanceof Error ? err.message : String(err) });
    useShellStore.getState().openMajor('compendium', { avoid: 'encounters' });
    return;
  }
  const what = row.label || row.ref.name;
  const fighting =
    useCombatStore.getState().encounterId === encounterId || encounter.state !== null;
  const campaignName = useCampaignStore.getState().current?.campaign.name ?? 'this campaign';
  await useCompendiumStore.getState().startDraft(draft, {
    choices: [
      {
        id: 'encounter',
        label: `Use it in ${encounter.name}`,
        detail: `${row.quantity > 1 ? `Every ${what} in that row` : what}${
          fighting ? ', in the fight too' : ''
        }. Other encounters keep the original.`,
      },
      {
        id: 'campaign',
        label: `Use it everywhere in ${campaignName}`,
        detail: `Every encounter, fight and map that uses ${row.ref.name}.`,
      },
      { id: 'none', label: 'Just save it', detail: 'Encounters keep the original for now.' },
    ],
    apply: async (saved, choice) => {
      if (choice === 'encounter') await applySavedRecord(encounterId, templateId, saved);
      if (choice === 'campaign') await replaceInCampaign(original, recordTarget(saved));
    },
  });
  useShellStore.getState().openMajor('compendium', { avoid: 'encounters' });
}
