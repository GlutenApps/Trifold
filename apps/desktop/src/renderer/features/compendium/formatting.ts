import { abilityModifier, normalizeKey, proficiencyBonusForCr } from '@trifold/rules';
import type { Feature, MonsterData } from '@trifold/schema';

/** Pure display helpers for the 2024-layout stat block (DESIGN.md §7.2 conversions). */

export const SIZE_NAMES: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** `init` when present, else the Dex modifier (legacy conversion). */
export function initiativeBonus(data: MonsterData): number {
  return data.initiativeBonus ?? abilityModifier(data.abilities.dex);
}

/** The Proficiency Bonus trait when present, else derived from CR. */
export function proficiencyBonus(data: MonsterData): number | null {
  return data.proficiencyBonus ?? proficiencyBonusForCr(data.cr);
}

export function speedText(data: MonsterData): string {
  const s = data.speeds;
  const parts: string[] = [];
  if (s.walk !== undefined) parts.push(`${s.walk} ft.`);
  if (s.burrow !== undefined) parts.push(`Burrow ${s.burrow} ft.`);
  if (s.climb !== undefined) parts.push(`Climb ${s.climb} ft.`);
  if (s.fly !== undefined) parts.push(`Fly ${s.fly} ft.${s.hover ? ' (hover)' : ''}`);
  if (s.swim !== undefined) parts.push(`Swim ${s.swim} ft.`);
  return parts.length > 0 ? parts.join(', ') : s.raw || '—';
}

export function usesText(feature: Feature): string | null {
  if (feature.recharge) {
    return feature.recharge.min === 6 ? 'Recharge 6' : `Recharge ${feature.recharge.min}–6`;
  }
  if (feature.uses) {
    const per: Record<string, string> = {
      day: 'Day',
      turn: 'Turn',
      shortRest: 'Short Rest',
      longRest: 'Long Rest',
      rest: 'Rest',
    };
    return `${feature.uses.count}/${per[feature.uses.per] ?? feature.uses.per}`;
  }
  return null;
}

export function crText(data: MonsterData): string {
  if (!data.cr) return '—';
  return `${data.cr} (XP ${data.xp.toLocaleString()}${proficiencyBonus(data) !== null ? `; PB ${signed(proficiencyBonus(data) ?? 0)}` : ''})`;
}

/** Splits text into plain chunks and spell-name links for the given spell list. */
export function linkifySpells(
  text: string,
  spellNames: readonly string[],
): Array<{ text: string; key?: string }> {
  const names = spellNames.filter((n) => n.trim().length > 0);
  if (names.length === 0 || text.length === 0) return [{ text }];
  const escaped = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  const out: Array<{ text: string; key?: string }> = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], key: normalizeKey(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
