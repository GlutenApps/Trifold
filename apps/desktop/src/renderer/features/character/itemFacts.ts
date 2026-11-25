import { useEffect, useState } from 'react';
import { itemArmor } from '@trifold/rules';
import type { ItemArmor, Sheet, SheetItem, SheetRef } from '@trifold/schema';

/**
 * What a sheet needs to know about a linked item from its compendium record
 * (docs/CHARACTER-SHEET.md, items 1 and 2): what it adds to AC when worn, and whether it needs
 * attunement. Read once per record and kept for the session; a record that is gone gives none.
 */
export interface ItemFacts {
  armor?: ItemArmor;
  attunement: boolean;
}

const cache = new Map<string, Promise<ItemFacts | null>>();

export function itemFacts(ref: SheetRef): Promise<ItemFacts | null> {
  const key = `${ref.kind}:${ref.key}`;
  let found = cache.get(key);
  if (!found) {
    found = window.trifold.compendium
      .findByKey('item', ref.key)
      .then((records) => {
        const record = records.find((r) => r.kind === 'item');
        if (!record || record.kind !== 'item') return null;
        const armor = itemArmor(record.displayName, record.data);
        return {
          ...(armor ? { armor } : {}),
          attunement: !!record.data.requiresAttunement,
        };
      })
      .catch(() => null);
    cache.set(key, found);
  }
  return found;
}

/** Forgets what was read, for tests. */
export function clearItemFacts(): void {
  cache.clear();
}

/**
 * Which linked items need attunement, read from their records for those the sheet has not
 * kept it for yet. By item id.
 */
export function useAttunementNeeded(items: readonly SheetItem[]): ReadonlySet<string> {
  const [needed, setNeeded] = useState<ReadonlySet<string>>(new Set());
  const unknown = items.filter((i) => i.ref && i.attunement === undefined);
  const keys = unknown.map((i) => `${i.id}:${i.ref!.key}`).join('|');
  useEffect(() => {
    if (!keys) return;
    let live = true;
    void Promise.all(
      unknown.map(async (i) => ((await itemFacts(i.ref!))?.attunement ? i.id : null)),
    ).then((ids) => {
      if (live) setNeeded(new Set(ids.filter((x): x is string => !!x)));
    });
    return () => {
      live = false;
    };
    // `keys` stands for the items read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  return needed;
}

/**
 * Equips or unequips an item, or attunes or ends it. A linked item's record is read first, so
 * the sheet keeps what it adds to AC and whether it needs attunement; the change is then saved
 * onto the sheet as it is by that time (`get`), not as it was when pressed.
 */
export async function toggleItem(
  get: () => Sheet | undefined,
  save: (sheet: Sheet) => void,
  id: string,
  field: 'equipped' | 'attuned',
): Promise<void> {
  const item = get()?.equipment.find((i) => i.id === id);
  if (!item) return;
  const facts =
    item.ref && (item.armor === undefined || item.attunement === undefined)
      ? await itemFacts(item.ref)
      : null;
  const now = get();
  if (!now) return;
  save({
    ...now,
    equipment: now.equipment.map((i) =>
      i.id !== id
        ? i
        : {
            ...i,
            [field]: !i[field],
            ...(facts?.armor && !i.armor ? { armor: facts.armor } : {}),
            ...(facts && i.attunement === undefined ? { attunement: facts.attunement } : {}),
          },
    ),
  });
}
