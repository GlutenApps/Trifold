/**
 * Source priority (ADR 0027): the order in which sources answer when a record exists in more
 * than one. The DM's saved order comes first, ids that no longer exist dropped; any source not
 * in it (a new import, or every source before the DM has ordered them) follows, in the default
 * order: homebrew, then imported files, then the bundled SRD with its 2024 rules ahead of the
 * legacy ones, each group by name.
 */
export interface OrderableSource {
  id: string;
  name: string;
  kind: string;
  defaultEdition?: string;
}

function defaultRank(s: OrderableSource): number {
  if (s.kind === 'homebrew') return 0;
  if (s.kind !== 'srd') return 1;
  return s.defaultEdition === '2024' ? 2 : 3;
}

export function sourceOrder(
  sources: readonly OrderableSource[],
  saved: readonly string[],
): string[] {
  const known = new Map(sources.map((s) => [s.id, s]));
  const head = [...new Set(saved)].filter((id) => known.has(id));
  const placed = new Set(head);
  const rest = sources
    .filter((s) => !placed.has(s.id))
    .sort(
      (a, b) =>
        defaultRank(a) - defaultRank(b) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
    )
    .map((s) => s.id);
  return [...head, ...rest];
}

/** `order` with `id` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveInOrder(order: readonly string[], id: string, step: -1 | 1): string[] {
  const i = order.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** `order` with `id` taken out and put back at `index` among the others (clamped), for a drag. */
export function placeInOrder(order: readonly string[], id: string, index: number): string[] {
  if (!order.includes(id)) return [...order];
  const rest = order.filter((o) => o !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
