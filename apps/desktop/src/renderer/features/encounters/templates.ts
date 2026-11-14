import { ulid } from 'ulid';
import type { Combatant, CombatantTemplate, EntityRef, NPC, Token } from '@trifold/schema';

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
 * The row an edited creature was saved from (ADR 0035): the whole row, every copy in it, points
 * at the new record. Its quantity, role and tokens stay; the label and HP override go, since the
 * record now carries that name and HP.
 */
export function retargetToRecord(
  templates: readonly CombatantTemplate[],
  templateId: string,
  target: RecordTarget,
): CombatantTemplate[] {
  return templates.map((t) => {
    if (t.id !== templateId) return t;
    const { hpOverride: _hp, label: _label, ...rest } = t;
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

/** What identifies a record wherever it is referenced. */
export interface RecordIdentity {
  id: string;
  sourceId: string;
  key: string;
}

/**
 * Whether a reference points at this record: the same id, or the same key in the same source (a
 * re-imported source gives its records new ids but keeps their keys).
 */
export function refersTo(ref: EntityRef, record: RecordIdentity): boolean {
  if (ref.kind !== 'record') return false;
  return (
    ref.ref.recordId === record.id ||
    (ref.ref.sourceId === record.sourceId && !!record.key && ref.ref.key === record.key)
  );
}

export function replaceInTemplates(
  templates: readonly CombatantTemplate[],
  from: RecordIdentity,
  to: RecordTarget,
): CombatantTemplate[] {
  return templates.map((t) => (refersTo(t.ref, from) ? { ...t, ref: to.ref, cache: to.cache } : t));
}

export function replaceInCombatants(
  combatants: readonly Combatant[],
  from: RecordIdentity,
  to: RecordTarget,
): Combatant[] {
  return combatants.map((c) =>
    refersTo(c.ref, from) ? { ...c, ref: to.ref, recordId: to.ref.ref.recordId } : c,
  );
}

export function replaceInTokens(
  tokens: readonly Token[],
  from: RecordIdentity,
  to: RecordTarget,
): Token[] {
  return tokens.map((t) =>
    t.kind !== 'marker' && refersTo(t.ref, from) ? { ...t, ref: to.ref } : t,
  );
}

/**
 * "Just Goblin 2" at Save (ADR 0035): one fighter out of a group gets its own row, pointing at
 * the saved record and taking its token with it; the group keeps the rest. A lone row is simply
 * switched. Resolves to the templates and the row the fighter now belongs to.
 */
export function splitToRecord(
  templates: readonly CombatantTemplate[],
  templateId: string,
  target: RecordTarget,
  tokenId?: string,
): { templates: CombatantTemplate[]; rowId: string } {
  const source = templates.find((t) => t.id === templateId);
  if (!source || source.quantity <= 1) {
    return { templates: retargetToRecord(templates, templateId, target), rowId: templateId };
  }
  const had = source.tokenIds ?? [];
  const remaining = tokenId ? had.filter((id) => id !== tokenId) : had;
  const group: CombatantTemplate = {
    ...source,
    quantity: source.quantity - 1,
    ...(source.tokenIds ? { tokenIds: remaining } : {}),
  };
  const own: CombatantTemplate = {
    id: ulid(),
    ref: target.ref,
    quantity: 1,
    role: source.role,
    hidden: source.hidden,
    cache: target.cache,
    ...(tokenId ? { tokenId } : {}),
  };
  return {
    templates: templates.flatMap((t) => (t.id === source.id ? [group, own] : [t])),
    rowId: own.id,
  };
}
