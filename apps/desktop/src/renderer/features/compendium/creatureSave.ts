import { ulid } from 'ulid';
import { normalizeKey } from '@trifold/rules';
import type { CompendiumRecord, Encounter, Scene } from '@trifold/schema';
import { HOMEBREW_BOOK, HOMEBREW_SOURCE_ID, isCampaignSource } from './homebrew';
import { describePlan, planElsewhere, planReplace } from '../encounters/replaceReferences';
import { recordTarget } from '../encounters/creatureEdits';
import { refersTo, type RecordIdentity } from '../encounters/templates';

/**
 * The Save step's choices (ADR 0035 §2), worked out from where Edit was pressed and what the
 * campaign holds, so the step shows only those that apply. Pure: the editor component asks
 * these and carries out what the DM confirms.
 */

/** Where Edit was pressed. */
export type EditOrigin =
  | { kind: 'record' }
  | { kind: 'row'; encounterId: string; templateId: string }
  | {
      kind: 'fighter';
      encounterId: string;
      templateId: string;
      combatantId: string;
      fighterName: string;
    };

/** Where the saved record lives. */
export type Home = 'campaign' | 'library' | 'update' | 'new';
/** Where it is used once saved. */
export type Scope = 'none' | 'one' | 'row' | 'encounter' | 'campaign';

export interface Choice<T extends string> {
  id: T;
  label: string;
  detail?: string;
}

export const identityOf = (
  r: Pick<CompendiumRecord, 'id' | 'sourceId' | 'key'>,
): RecordIdentity => ({
  id: r.id,
  sourceId: r.sourceId,
  key: r.key,
});

/** The open campaign, as the step needs it. */
export interface CampaignView {
  slug: string;
  name: string;
  encounters: readonly Encounter[];
  scenes: readonly Scene[];
}

/**
 * Where it can live. Your own record: Update (the default) or Save as new. A copy: this campaign
 * (the default when one is open) or your compendium.
 */
export function homeChoices(own: boolean, campaign: CampaignView | null): Choice<Home>[] {
  if (own) {
    return [
      { id: 'update', label: 'Update it' },
      { id: 'new', label: 'Save as new', detail: 'The one you opened stays as it was.' },
    ];
  }
  const library: Choice<Home> = {
    id: 'library',
    label: 'In my compendium',
    detail: 'For every campaign.',
  };
  if (!campaign) return [library];
  return [
    { id: 'campaign', label: `In ${campaign.name}`, detail: 'Listed only while it is open.' },
    library,
  ];
}

/** The record as it will be written: its home's id and source, unless it is updated in place. */
export function rehome(
  record: CompendiumRecord,
  home: Home,
  campaign: Pick<CampaignView, 'slug' | 'name'> | null,
): CompendiumRecord {
  if (home === 'update') return record;
  // Save as new stays where the record was; a copy goes where the DM chose.
  const toCampaign =
    home === 'campaign' || (home === 'new' && isCampaignSource(record.sourceId) && !!campaign);
  const fresh: CompendiumRecord =
    home === 'new'
      ? { ...record, basedOn: record.basedOn ?? { recordId: record.id, sourceId: record.sourceId } }
      : record;
  if (toCampaign && campaign) {
    return {
      ...fresh,
      id: `creature:${record.kind}:${ulid()}`,
      sourceId: `campaign:${campaign.slug}`,
      sourceBook: campaign.name,
    };
  }
  return {
    ...fresh,
    id: `${HOMEBREW_SOURCE_ID}:${record.kind}:${ulid()}`,
    sourceId: HOMEBREW_SOURCE_ID,
    sourceBook: HOMEBREW_BOOK,
  };
}

/** Whether the record will be listed in the Library's compendium, where names must differ. */
export const goesToLibrary = (record: CompendiumRecord, home: Home) =>
  home === 'library' || (home !== 'campaign' && record.sourceId === HOMEBREW_SOURCE_ID);

/**
 * A free name for the Library: the name with the lowest number after it not taken. Brackets are
 * never used, since they are ignored when names are matched.
 */
export function freeName(name: string, taken: (key: string) => boolean): string {
  const base = name.trim();
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} ${n}`;
    if (!taken(normalizeKey(candidate))) return candidate;
  }
  return `${base} ${ulid().slice(-4)}`;
}

/** What the original is, for the scope choices: what to switch from, and what to call it. */
export interface Original {
  identity: RecordIdentity;
  name: string;
}

/** The tracker's fight, fresher than its encounter's saved state. */
export type LiveFight = { encounterId: string; combatants: readonly { ref: unknown }[] } | null;

/**
 * Where it can be used, narrowest first (the default). Only choices with something to change
 * are offered; an update in place needs none, since everything that used it still does.
 */
export function scopeChoices(
  origin: EditOrigin,
  home: Home,
  original: Original | null,
  campaign: CampaignView | null,
  live: LiveFight,
): Choice<Scope>[] {
  if (home === 'update' || !original) return [];
  const name = original.name;
  // Counting needs a target; the identity of an unsaved record never matches anything.
  const probe = recordTarget({
    id: '\u0000',
    kind: 'monster',
    key: '\u0000',
    displayName: '',
    sourceId: '\u0000',
    edition: '2024',
  } as CompendiumRecord);
  const fight = live as Parameters<typeof planReplace>[3];

  if (origin.kind === 'record') {
    const plan = campaign ? planReplace(campaign, original.identity, probe, fight) : null;
    const what = plan ? describePlan(plan) : '';
    return [
      { id: 'none', label: 'Nowhere yet' },
      ...(what
        ? [{ id: 'campaign' as const, label: `Every ${name} in ${campaign!.name}`, detail: what }]
        : []),
    ];
  }

  const encounter = campaign?.encounters.find((e) => e.id === origin.encounterId);
  const rows = (encounter?.combatants ?? []).filter((t) => refersTo(t.ref, original.identity));
  const row = encounter?.combatants.find((t) => t.id === origin.templateId);
  const users = rows.reduce((n, t) => n + t.quantity, 0);
  const elsewhere =
    campaign && encounter
      ? describePlan(planElsewhere(campaign, encounter.id, original.identity, probe, fight))
      : '';
  const out: Choice<Scope>[] = [];
  if (origin.kind === 'fighter') {
    out.push({
      id: 'one',
      label: `Just ${origin.fighterName}`,
      ...(row && row.quantity > 1 ? { detail: 'It leaves its group as a row of its own.' } : {}),
    });
    if (users > 1)
      out.push({
        id: 'encounter',
        label: `Every ${name} in this fight`,
        detail: `${users} in all`,
      });
  } else {
    const q = row?.quantity ?? 1;
    out.push({ id: 'row', label: 'This row', ...(q > 1 ? { detail: `${q} of them` } : {}) });
    if (rows.length > 1)
      out.push({
        id: 'encounter',
        label: `Every ${name} in this encounter`,
        detail: `${rows.length} rows`,
      });
  }
  if (elsewhere && campaign) {
    out.push({
      id: 'campaign',
      label: `Every ${name} in ${campaign.name}`,
      detail: `Also ${elsewhere}`,
    });
  }
  return out;
}
