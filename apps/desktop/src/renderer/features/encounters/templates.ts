import { ulid } from 'ulid';
import type { Combatant, CombatantTemplate, NPC } from '@trifold/schema';

/** Edits to an encounter's templates that the running fight makes on its own (ADR 0012). */

/**
 * Records which map token a combatant is tied to, so the next time the encounter runs on that
 * map the link is already there. A numbered creature in a group writes its own slot.
 */
export function withTokenLink(
  templates: readonly CombatantTemplate[],
  combatant: Pick<Combatant, 'templateId' | 'name'>,
  tokenId: string | null,
): CombatantTemplate[] {
  if (!combatant.templateId) return [...templates];
  return templates.map((t) => {
    if (t.id !== combatant.templateId) return t;
    if (t.quantity <= 1) {
      const { tokenId: _one, tokenIds: _many, ...rest } = t;
      return tokenId ? { ...rest, tokenId } : rest;
    }
    const numbered = /\s(\d+)$/.exec(combatant.name);
    if (!numbered) return t;
    const index = Number(numbered[1]) - 1;
    const ids = [...(t.tokenIds ?? [])];
    while (ids.length <= index) ids.push('');
    ids[index] = tokenId ?? '';
    return { ...t, tokenIds: ids };
  });
}

/**
 * Points a template at a named NPC. One creature out of a group becomes its own template
 * (taking its token with it); a lone template is simply retargeted.
 */
export function retargetToNpc(
  templates: readonly CombatantTemplate[],
  templateId: string | undefined,
  npc: Pick<NPC, 'id' | 'name'>,
  tokenId?: string,
): CombatantTemplate[] {
  const ref = { kind: 'npc', npcId: npc.id, name: npc.name } as const;
  const source = templates.find((t) => t.id === templateId);
  if (!source) {
    return [
      ...templates,
      {
        id: ulid(),
        ref,
        quantity: 1,
        role: 'enemy',
        hidden: false,
        ...(tokenId ? { tokenId } : {}),
      },
    ];
  }
  if (source.quantity <= 1) {
    const { tokenId: own, tokenIds, label: _label, ...rest } = source;
    const kept = tokenId ?? own ?? tokenIds?.[0];
    return templates.map((t) =>
      t.id === source.id ? { ...rest, ref, quantity: 1, ...(kept ? { tokenId: kept } : {}) } : t,
    );
  }
  const had = source.tokenIds ?? [];
  const taken = tokenId ?? (had.length ? had[had.length - 1] : undefined);
  const remaining = taken ? had.filter((id) => id !== taken) : had;
  const group: CombatantTemplate = {
    ...source,
    quantity: source.quantity - 1,
    ...(source.tokenIds ? { tokenIds: remaining } : {}),
  };
  const own: CombatantTemplate = {
    id: ulid(),
    ref,
    quantity: 1,
    role: source.role,
    hidden: source.hidden,
    ...(source.cache ? { cache: source.cache } : {}),
    ...(taken ? { tokenId: taken } : {}),
  };
  return templates.flatMap((t) => (t.id === source.id ? [group, own] : [t]));
}

/** What a saved homebrew monster gives an encounter row: its reference and the cached numbers. */
export interface RecordTarget {
  ref: Extract<CombatantTemplate['ref'], { kind: 'record' }>;
  cache: NonNullable<CombatantTemplate['cache']>;
}

/**
 * Save to compendium's "Use it in this encounter" (DESIGN.md §6.2): the whole row, every copy in
 * it, points at the new record. Its label, quantity, role and tokens stay; the HP override goes,
 * since the record now carries that HP.
 */
export function retargetToRecord(
  templates: readonly CombatantTemplate[],
  templateId: string,
  target: RecordTarget,
): CombatantTemplate[] {
  return templates.map((t) => {
    if (t.id !== templateId) return t;
    const { hpOverride: _hp, ...rest } = t;
    return { ...rest, ref: target.ref, cache: target.cache };
  });
}

/**
 * The same switch for a fight in progress: the row's combatants point at the new record and its
 * stat block, keeping their HP, conditions and everything the fight has done to them.
 */
export function retargetCombatants(
  combatants: readonly Combatant[],
  templateId: string,
  target: RecordTarget,
): Combatant[] {
  return combatants.map((c) =>
    c.templateId === templateId && c.ref.kind === 'record'
      ? { ...c, ref: target.ref, recordId: target.ref.ref.recordId }
      : c,
  );
}

/** The map tokens a row placed, so they can follow it to the new record. */
export function templateTokenIds(template: CombatantTemplate): string[] {
  return [...(template.tokenIds ?? []), ...(template.tokenId ? [template.tokenId] : [])].filter(
    Boolean,
  );
}
