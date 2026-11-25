import { useEffect, useState } from 'react';
import type { SheetRef, SheetSpell } from '@trifold/schema';

/**
 * What a spell row shows and casting needs from a linked spell's compendium record
 * (docs/CHARACTER-SHEET.md, items 14 and 15): whether it needs concentration or can be a ritual,
 * its casting time and range. Read once per record and kept for the session; a record that is
 * gone gives none, and the row shows only what the sheet has.
 */
export interface SpellFacts {
  concentration: boolean;
  ritual: boolean;
  time: string;
  range: string;
}

const cache = new Map<string, Promise<SpellFacts | null>>();

export function spellFacts(ref: SheetRef): Promise<SpellFacts | null> {
  let found = cache.get(ref.key);
  if (!found) {
    found = window.trifold.compendium
      .findByKey('spell', ref.key)
      .then((records) => {
        const record = records.find((r) => r.kind === 'spell');
        if (!record || record.kind !== 'spell') return null;
        const d = record.data;
        return {
          concentration: /^\s*concentration/i.test(d.duration),
          ritual: d.ritual,
          // The SRD snapshot writes "Bonus-action"; the row reads "Bonus action".
          time: d.time.trim().replace(/(\w)-(\w)/g, '$1 $2'),
          range: d.range.trim(),
        };
      })
      .catch(() => null);
    cache.set(ref.key, found);
  }
  return found;
}

/** Forgets what was read, for tests. */
export function clearSpellFacts(): void {
  cache.clear();
}

/** The facts for each linked spell on the sheet, by spell id, as they are read. */
export function useSpellFacts(spells: readonly SheetSpell[]): ReadonlyMap<string, SpellFacts> {
  const [facts, setFacts] = useState<ReadonlyMap<string, SpellFacts>>(new Map());
  const linked = spells.filter((s) => s.ref);
  const keys = linked.map((s) => `${s.id}:${s.ref!.key}`).join('|');
  useEffect(() => {
    if (!keys) {
      setFacts(new Map());
      return;
    }
    let live = true;
    void Promise.all(linked.map(async (s) => [s.id, await spellFacts(s.ref!)] as const)).then(
      (pairs) => {
        if (!live) return;
        setFacts(new Map(pairs.filter((p): p is [string, SpellFacts] => !!p[1])));
      },
    );
    return () => {
      live = false;
    };
    // `keys` stands for the spells read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  return facts;
}
