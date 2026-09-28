import type { CompendiumRecord, Feature } from '@trifold/schema';

/** "Changed from original" (DESIGN.md §6.2): a flat list of differences between two records. */
export interface DiffLine {
  field: string;
  from: string;
  to: string;
}

function show(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(show).join(', ') : '—';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    return entries.length ? entries.map(([k, v]) => `${k} ${show(v)}`).join(', ') : '—';
  }
  return String(value);
}

const FEATURE_LISTS: Array<[string, (d: Record<string, unknown>) => Feature[]]> = [
  ['Traits', (d) => d['traits'] as Feature[]],
  ['Actions', (d) => d['actions'] as Feature[]],
  ['Bonus actions', (d) => d['bonusActions'] as Feature[]],
  ['Reactions', (d) => d['reactions'] as Feature[]],
  ['Legendary actions', (d) => (d['legendary'] as { actions: Feature[] }).actions],
  ['Lair actions', (d) => d['lair'] as Feature[]],
];

const SKIP = new Set([
  'traits',
  'actions',
  'bonusActions',
  'reactions',
  'legendary',
  'lair',
  'extra',
]);

export function diffRecords(original: CompendiumRecord, copy: CompendiumRecord): DiffLine[] {
  const lines: DiffLine[] = [];
  if (original.displayName !== copy.displayName) {
    lines.push({ field: 'Name', from: original.displayName, to: copy.displayName });
  }
  const a = original.data as unknown as Record<string, unknown>;
  const b = copy.data as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (SKIP.has(key)) continue;
    const from = JSON.stringify(a[key] ?? null);
    const to = JSON.stringify(b[key] ?? null);
    if (from !== to) lines.push({ field: key, from: show(a[key]), to: show(b[key]) });
  }
  if (original.kind === 'monster' && copy.kind === 'monster') {
    for (const [label, pick] of FEATURE_LISTS) {
      const before = new Map(pick(a).map((f) => [f.name, f]));
      const after = new Map(pick(b).map((f) => [f.name, f]));
      for (const [name, f] of before) {
        const g = after.get(name);
        if (!g) lines.push({ field: `${label}: ${f.displayName}`, from: f.text, to: '(removed)' });
        else if (g.text !== f.text)
          lines.push({ field: `${label}: ${f.displayName}`, from: f.text, to: g.text });
      }
      for (const [name, g] of after) {
        if (!before.has(name))
          lines.push({ field: `${label}: ${g.displayName}`, from: '(new)', to: g.text });
      }
    }
    const lp = (original.data.legendary.perTurn ?? null) !== (copy.data.legendary.perTurn ?? null);
    if (lp) {
      lines.push({
        field: 'Legendary actions per turn',
        from: show(original.data.legendary.perTurn),
        to: show(copy.data.legendary.perTurn),
      });
    }
  }
  return lines;
}
