import { create } from 'zustand';
import { normalizeKey } from '@trifold/rules';
import type { CombatantTemplate, CompendiumRecord, Encounter } from '@trifold/schema';
import type { EditOrigin, Original, Scope } from '../compendium/creatureSave';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { builderDraftFor } from './builderDraft';
import { replaceInCampaign, replaceInEncounter } from './replaceReferences';
import {
  retargetCombatants,
  retargetToRecord,
  templateTokenIds,
  type RecordTarget,
} from './templates';

/**
 * Editing a creature where it is (ADR 0035 §1): Edit on a builder row or a fighter in the
 * tracker opens the monster editor in the Encounters panel on a copy of its stat block (not yet
 * written), named after the row's label and with its HP override. What Save then does with the
 * saved record (this row, this fighter, every one in the encounter or the campaign) is carried
 * out here.
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
  await retargetTokens(new Set(templateTokenIds(row)), target);
}

/** Tokens a row or fighter placed follow it to the new record, so a later link finds it. */
export async function retargetTokens(
  tokenIds: ReadonlySet<string>,
  target: RecordTarget,
): Promise<void> {
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
 * Carries out where the saved record is used (ADR 0035 §2). Wider choices are Replace
 * references; the row or fighter Edit was pressed on switches first, taking the new name.
 */
export async function applyScope(
  scope: Scope,
  origin: EditOrigin,
  original: Original | null,
  saved: CompendiumRecord,
): Promise<void> {
  const target = recordTarget(saved);
  if (scope === 'none') return;
  if (origin.kind === 'record') {
    if (scope === 'campaign' && original) await replaceInCampaign(original.identity, target);
    return;
  }
  if (scope === 'one' && origin.kind === 'fighter') {
    const combat = useCombatStore.getState();
    const fighter = combat.state?.combatants.find((c) => c.id === origin.combatantId);
    combat.splitToRecord(origin.combatantId, target);
    await retargetTokens(new Set(fighter?.tokenId ? [fighter.tokenId] : []), target);
    return;
  }
  await applySavedRecord(origin.encounterId, origin.templateId, saved);
  if (!original) return;
  if (scope === 'encounter')
    await replaceInEncounter(origin.encounterId, original.identity, target);
  if (scope === 'campaign') await replaceInCampaign(original.identity, target);
}

/** What the Encounters panel shows in place of the builder or tracker while one is edited. */
export interface CreatureEdit {
  record: CompendiumRecord;
  original: Original;
  origin: EditOrigin;
  title: string;
}

/** The creature being edited in the Encounters panel, if any. */
export const useCreatureEditStore = create<{
  edit: CreatureEdit | null;
  error: string | null;
  close(): void;
}>((set) => ({ edit: null, error: null, close: () => set({ edit: null, error: null }) }));

/** The copy a row opens on, from its compendium creature. */
async function copyOfRow(
  row: CombatantTemplate,
): Promise<{ record: CompendiumRecord; original: Original } | null> {
  if (row.ref.kind !== 'record') return null;
  try {
    const draft = await window.trifold.homebrew.draft(row.ref.ref.recordId);
    return {
      record: draftFromRow(draft, row),
      original: {
        identity: {
          id: row.ref.ref.recordId,
          sourceId: row.ref.ref.sourceId,
          key: row.ref.ref.key,
        },
        name: row.ref.name,
      },
    };
  } catch (err) {
    useCreatureEditStore.setState({ error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Edit on a builder row. `encounter` and `row` are what the builder shows, edits and all. */
export async function editRow(encounter: Encounter, row: CombatantTemplate): Promise<void> {
  const copy = await copyOfRow(row);
  if (!copy) return;
  useCreatureEditStore.setState({
    edit: {
      ...copy,
      origin: { kind: 'row', encounterId: encounter.id, templateId: row.id },
      title: `Edit ${row.label || row.ref.name}`,
    },
    error: null,
  });
}

/** Edit on a fighter in the running fight. */
export async function editFighter(combatantId: string): Promise<void> {
  const { encounterId, state } = useCombatStore.getState();
  const fighter = state?.combatants.find((c) => c.id === combatantId);
  const encounter = useCampaignStore
    .getState()
    .current?.encounters.find((e) => e.id === encounterId);
  const row = encounter?.combatants.find((t) => t.id === fighter?.templateId);
  if (!fighter || !encounter || !row) return;
  const copy = await copyOfRow(row);
  if (!copy) return;
  useCreatureEditStore.setState({
    edit: {
      ...copy,
      origin: {
        kind: 'fighter',
        encounterId: encounter.id,
        templateId: row.id,
        combatantId,
        fighterName: fighter.name,
      },
      title: `Edit ${fighter.name}`,
    },
    error: null,
  });
}
