import type { Ability, ItemRecord, Sheet, SheetAttack, SheetItem } from '@trifold/schema';
import { scoreModifier } from './derive';

/**
 * Starting equipment for the guided builder (docs/BUILDER.md): an option's text read into items
 * and gold, and the SRD's item records turned into the sheet's equipment, its armour and its
 * attacks. Pure: the item records are handed in.
 */

export interface EquipmentLine {
  name: string;
  quantity: number;
}

/** Splits on commas that are not inside brackets: "Book (prayers), Robe" → two. */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^and\s+/i, '')).filter(Boolean);
}

/**
 * One equipment option's items and gold: "A: Chain Mail, 8 Javelins, Dungeoneer's Pack, and
 * 4 GP" → three items (8 Javelins) and 4 gold; "B: 75 GP" → no items and 75 gold.
 */
export function optionItems(option: string): { items: EquipmentLine[]; gp: number } {
  const body = option.replace(/^[A-Z]:\s*/, '');
  const items: EquipmentLine[] = [];
  let gp = 0;
  for (const part of splitTop(body)) {
    const gold = /^(\d+)\s*GP$/i.exec(part);
    if (gold) {
      gp += Number(gold[1]);
      continue;
    }
    const counted = /^(\d+)\s+(.+)$/.exec(part);
    items.push(
      counted
        ? { name: counted[2]!.trim(), quantity: Number(counted[1]) }
        : { name: part, quantity: 1 },
    );
  }
  return { items, gp };
}

/** An item record by name: as written, then without a plural ending ("8 Javelins" → Javelin). */
export function findItem(
  name: string,
  byName: ReadonlyMap<string, ItemRecord>,
): ItemRecord | undefined {
  const key = name.trim().toLowerCase();
  return (
    byName.get(key) ??
    byName.get(key.replace(/es$/, '')) ??
    byName.get(key.replace(/s$/, '')) ??
    byName.get(key.replace(/\s*\(.*\)$/, ''))
  );
}

const DAMAGE_TYPE: Readonly<Record<string, string>> = {
  S: 'slashing',
  P: 'piercing',
  B: 'bludgeoning',
};

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

let nextId = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(nextId += 1)}`;

/**
 * Equipment lines on a sheet: each linked to its SRD item where one matches, the first body
 * armour and a shield setting the sheet's armour, and each weapon an attack with the ability it
 * uses (Dexterity for ranged, the better of the two for finesse) and its damage.
 */
export function equipmentToSheet(
  lines: readonly EquipmentLine[],
  byName: ReadonlyMap<string, ItemRecord>,
  abilities: Readonly<Record<Ability, number>>,
): { equipment: SheetItem[]; armor: Sheet['armor'] | null; attacks: SheetAttack[] } {
  const equipment: SheetItem[] = [];
  const attacks: SheetAttack[] = [];
  let body: { kind: Sheet['armor']['kind']; base: number } | null = null;
  let shield = false;
  const str = scoreModifier(abilities.str);
  const dex = scoreModifier(abilities.dex);
  for (const line of lines) {
    const item = findItem(line.name, byName);
    equipment.push({
      id: id('item'),
      name: item?.displayName ?? line.name,
      quantity: line.quantity,
      ...(item ? { ref: { kind: 'item' as const, key: item.key, name: item.displayName } } : {}),
    });
    if (!item) continue;
    const d = item.data;
    if (/shield/i.test(item.displayName)) shield = true;
    else if (!body && d.ac !== undefined && ['LA', 'MA', 'HA'].includes(d.typeCode ?? '')) {
      body = {
        kind: d.typeCode === 'LA' ? 'light' : d.typeCode === 'MA' ? 'medium' : 'heavy',
        base: d.ac,
      };
    }
    if (d.dmg1 && (d.typeCode === 'M' || d.typeCode === 'R')) {
      const props = d.properties ?? [];
      const ability: Ability =
        d.typeCode === 'R' ? 'dex' : props.includes('F') && dex > str ? 'dex' : 'str';
      const mod = ability === 'dex' ? dex : str;
      attacks.push({
        id: id('attack'),
        name: item.displayName,
        ability,
        proficient: true,
        bonus: 0,
        damage: `${d.dmg1}${mod ? signed(mod) : ''} ${DAMAGE_TYPE[d.dmgType ?? ''] ?? ''}`.trim(),
        ref: { kind: 'item', key: item.key, name: item.displayName },
      });
    }
  }
  const armor: Sheet['armor'] | null =
    body || shield
      ? { kind: body?.kind ?? 'none', base: body?.base ?? 11, shield, bonus: 0 }
      : null;
  return { equipment, armor, attacks };
}
