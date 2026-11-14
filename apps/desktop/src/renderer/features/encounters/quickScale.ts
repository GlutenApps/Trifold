import { CR_ORDER, scaleCr, SCALE_PARTS, xpForCr } from '@trifold/rules';
import type { CombatantTemplate, CompendiumRecord, Encounter, NPC, Token } from '@trifold/schema';
import { recordTarget } from './creatureEdits';
import { templateTokenIds, type RecordTarget } from './templates';

/**
 * Quick scale in the encounter builder (ADR 0038 §7): pick a new CR for each compendium creature
 * in the encounter and see the difficulty move as you go. Nothing is written until Apply, which
 * saves each scaled stat block to this campaign's creatures under the same name (the players
 * see no change) with every part the scaler moves, and points the rows at it.
 */

/** The new CR picked for each row, by template id. */
export type PendingCrs = Readonly<Record<string, string>>;

/** A row the quick scaler offers: a compendium creature with a CR on the list. */
export function canQuickScale(t: CombatantTemplate): boolean {
  return (
    t.ref.kind === 'record' && CR_ORDER.includes((t.cache?.cr ?? '') as (typeof CR_ORDER)[number])
  );
}

/** The CR a row shows: the picked one while it waits for Apply, else its own. */
export const crOf = (t: CombatantTemplate, pending: PendingCrs): string =>
  pending[t.id] ?? t.cache?.cr ?? '';

/** XP for one of a row's creatures at the CR it shows. */
export function xpOf(t: CombatantTemplate, pending: PendingCrs): number {
  const picked = pending[t.id];
  if (picked !== undefined && picked !== t.cache?.cr) return xpForCr(picked) ?? 0;
  return t.cache?.xp ?? 0;
}

/** The enemies' XP with the picked CRs, for the live difficulty. */
export function enemyXp(templates: readonly CombatantTemplate[], pending: PendingCrs): number {
  return templates
    .filter((t) => t.role === 'enemy')
    .reduce((n, t) => n + xpOf(t, pending) * t.quantity, 0);
}

/** Picks that actually change a row. */
export function changedRows(
  templates: readonly CombatantTemplate[],
  pending: PendingCrs,
): CombatantTemplate[] {
  return templates.filter(
    (t) => canQuickScale(t) && pending[t.id] !== undefined && pending[t.id] !== t.cache?.cr,
  );
}

/** Steps every scalable row's CR by one place on the list, from what each shows now. */
export function stepAll(
  templates: readonly CombatantTemplate[],
  pending: PendingCrs,
  by: -1 | 1,
): Record<string, string> {
  const next: Record<string, string> = { ...pending };
  for (const t of templates) {
    if (!canQuickScale(t)) continue;
    const at = CR_ORDER.indexOf(crOf(t, pending) as (typeof CR_ORDER)[number]);
    const to = CR_ORDER[Math.min(CR_ORDER.length - 1, Math.max(0, at + by))];
    if (to) next[t.id] = to;
  }
  return next;
}

/** What the campaign holds that could point at a scaled copy. */
export interface CampaignUses {
  slug: string;
  encounters: readonly Pick<Encounter, 'id' | 'combatants' | 'state'>[];
  npcs: readonly Pick<NPC, 'recordRef'>[];
  scenes?: readonly { tokens: readonly Pick<Token, 'id' | 'ref'>[] }[];
}

/**
 * Whether a scaled copy can simply be scaled again in place: it is this campaign's own scaled
 * copy, and nothing but the rows being scaled now (to the same CR) points at it. Otherwise the
 * scale makes a new copy, so another encounter's creature never changes under it.
 */
export function canRescaleInPlace(
  record: Pick<CompendiumRecord, 'id' | 'sourceId'> & { data?: { scaled?: unknown } },
  uses: CampaignUses,
  encounterId: string,
  /** The builder's rows for this encounter (fresher than the stored copy). */
  rows: readonly CombatantTemplate[],
  scaling: ReadonlySet<string>,
): boolean {
  if (record.sourceId !== `campaign:${uses.slug}` || !record.data?.scaled) return false;
  const pointsHere = (t: CombatantTemplate) =>
    t.ref.kind === 'record' && t.ref.ref.recordId === record.id;
  if (rows.some((t) => pointsHere(t) && !scaling.has(t.id))) return false;
  for (const e of uses.encounters) {
    if (e.id === encounterId) continue;
    if (e.combatants.some(pointsHere)) return false;
    if (e.state?.combatants.some((c) => c.ref.kind === 'record' && c.recordId === record.id))
      return false;
  }
  if (uses.npcs.some((n) => n.recordRef?.recordId === record.id)) return false;
  // Tokens the scaled rows placed follow them; any other token on the copy keeps it.
  const ours = new Set(rows.filter((t) => scaling.has(t.id)).flatMap(templateTokenIds));
  return !(uses.scenes ?? []).some((s) =>
    s.tokens.some(
      (k) => !ours.has(k.id) && k.ref.kind === 'record' && k.ref.ref.recordId === record.id,
    ),
  );
}

/** The calls Apply makes, so tests can stand in for the main process. */
export interface QuickScaleIo {
  get(recordId: string): Promise<CompendiumRecord | null>;
  draft(recordId: string): Promise<CompendiumRecord>;
  save(record: CompendiumRecord): Promise<CompendiumRecord>;
}

/** Where each scaled row now points, and the copies left unused, for the caller to remove. */
export interface ScaledRows {
  targets: Map<string, RecordTarget>;
  unused: string[];
}

/**
 * Scales each changed row's stat block and returns where each row should now point. Rows on the
 * same creature going to the same CR share one copy. A copy scaled back to the CR it came from
 * goes back to its original when that still exists, and is listed as unused when nothing else
 * points at it, so scaling up and back leaves no stray copy.
 */
export async function scaleRows(
  rows: readonly CombatantTemplate[],
  pending: PendingCrs,
  uses: CampaignUses,
  encounterId: string,
  io: QuickScaleIo,
): Promise<ScaledRows> {
  const changed = changedRows(rows, pending);
  const groups = new Map<string, CombatantTemplate[]>();
  for (const t of changed) {
    if (t.ref.kind !== 'record') continue;
    const k = `${t.ref.ref.recordId}\u0000${pending[t.id]}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const out = new Map<string, RecordTarget>();
  const unused: string[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    if (first.ref.kind !== 'record') continue;
    const toCr = pending[first.id]!;
    const record = await io.get(first.ref.ref.recordId);
    if (!record || record.kind !== 'monster') {
      throw new Error(`${first.ref.name}: its stat block could not be found`);
    }

    let saved: CompendiumRecord | null = null;
    // Only this group: rows on the same copy going to another CR need a copy of their own.
    const inPlace = canRescaleInPlace(
      record,
      uses,
      encounterId,
      rows,
      new Set(group.map((t) => t.id)),
    );
    // Back to where it started: the original again, when it is still there.
    if (record.data.scaled?.fromCr === toCr && record.basedOn) {
      const base = await io.get(record.basedOn.recordId);
      if (base?.kind === 'monster' && base.data.cr === toCr) {
        saved = base;
        if (inPlace) unused.push(record.id);
      }
    }
    if (!saved) {
      const data = scaleCr(record.data, toCr, new Set(SCALE_PARTS), record.displayName).monster;
      if (inPlace) {
        saved = await io.save({ ...record, data });
      } else {
        const copy = await io.draft(record.id);
        // The same name, so the TV and the players see nothing change; the tag says it is scaled.
        saved = await io.save({
          ...copy,
          name: record.name,
          displayName: record.displayName,
          key: record.key,
          basedOn: record.basedOn ?? copy.basedOn,
          data,
        } as CompendiumRecord);
      }
    }
    const target = recordTarget(saved);
    for (const t of group) out.set(t.id, target);
  }
  return { targets: out, unused };
}

/** The rows pointed at their scaled stat blocks, keeping labels; an HP override gives way. */
export function retargetScaled(
  templates: readonly CombatantTemplate[],
  targets: ReadonlyMap<string, RecordTarget>,
): CombatantTemplate[] {
  return templates.map((t) => {
    const target = targets.get(t.id);
    if (!target) return t;
    const { hpOverride: _hp, ...rest } = t;
    return { ...rest, ref: target.ref, cache: target.cache };
  });
}
