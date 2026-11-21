import { isDiceExpression } from '../dice';

/** Attack triples and the 2014/2024 text patterns (DATA-FORMATS.md §2.4–2.5). */

export interface AttackTriple {
  label: string;
  toHit?: number;
  /** Absent for to-hit-only triples such as `Spellcasting|+9|` (a spell attack bonus). */
  damage?: string;
}

/**
 * `label|toHit|damage`. Returns null when neither a to-hit nor a readable dice expression is
 * present, or when the damage part is present but not a dice expression.
 */
export function parseAttackTriple(raw: string): AttackTriple | null {
  const parts = raw.split('|');
  if (parts.length < 3) return null;
  const label = (parts[0] ?? '').trim();
  const toHitText = (parts[1] ?? '').trim().replace(/\s+/g, '');
  const damage = parts.slice(2).join('|').replace(/\s+/g, '');
  const toHit = toHitText ? Number.parseInt(toHitText, 10) : Number.NaN;
  const hasToHit = Number.isFinite(toHit);
  if (damage && !isDiceExpression(damage)) return null;
  if (!damage && !hasToHit) return null;
  const triple: AttackTriple = { label };
  if (hasToHit) triple.toHit = toHit;
  if (damage) triple.damage = damage;
  return triple;
}

export interface TextAttack {
  kind: string;
  toHit: number;
  reach?: string;
  range?: string;
  /** The damage fields are absent for an attack that deals none (a grab, a charm). */
  average?: number;
  damage?: string;
  damageType?: string;
  extraDamage: Array<{ damage: string; damageType: string }>;
  /** Character offset of the match, so callers can pair attacks with sentences. */
  index: number;
}

/**
 * The 2024 header. SRD 5.2 writes it several ways: `+5`, `+4 to hit`, and
 * `+5 (with Advantage if the target is Grappled)`.
 */
const ATTACK_2024 =
  /(Melee or Ranged|Melee|Ranged) Attack Roll:\s*([+-]\d+)(?:\s*to hit)?(?:\s*\([^)]*\))?,\s*/gi;
/** `reach 5 ft.`, `range 120 feet.`, `reach 10 ft. or range 20/60 ft.`: up to the period that ends it. */
const REACH_2024 = /^(reach|range)\s+(.{1,60}?)\.(?=\s+(?!or\b)|$)/i;
/** The damage right after the reach, with or without `Hit:` (SRD 5.2 drops it in places). */
const DAMAGE_2024 = /^\s*(?:Hit:\s*)?(\d+)\s*(?:\(([^)]+)\))?\s*([A-Za-z]+) damage/i;
const ATTACK_2014 =
  /(Melee|Ranged|Melee or Ranged) (Weapon|Spell) Attack:\s*([+-]\d+) to hit,\s*(reach|range)\s*([^,]+),\s*([^.]+)\.\s*Hit:\s*(\d+)\s*(?:\(([^)]+)\))?\s*([A-Za-z]+) damage/gi;
const EXTRA_DAMAGE = /plus\s*(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+) damage/gi;

function extraDamageIn(sentence: string): Array<{ damage: string; damageType: string }> {
  const out: Array<{ damage: string; damageType: string }> = [];
  for (const m of sentence.matchAll(EXTRA_DAMAGE)) {
    if (m[2] && m[3])
      out.push({ damage: m[2].replace(/\s+/g, ''), damageType: m[3].toLowerCase() });
  }
  return out;
}

function sentenceAfter(text: string, from: number): string {
  const rest = text.slice(from);
  const end = rest.search(/\.(\s|$)/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/** Finds every attack sentence in a feature's text, in either edition's phrasing. */
export function findAttacksInText(text: string): TextAttack[] {
  const out: TextAttack[] = [];
  for (const m of text.matchAll(ATTACK_2024)) {
    if (!m[1] || !m[2]) continue;
    let at = m.index + m[0].length;
    const attack: TextAttack = {
      kind: m[1].toLowerCase(),
      toHit: Number(m[2]),
      extraDamage: [],
      index: m.index,
    };
    const where = REACH_2024.exec(text.slice(at));
    if (where?.[1] && where[2]) {
      if (where[1].toLowerCase() === 'reach') attack.reach = where[2].trim();
      else attack.range = where[2].trim();
      at += where[0].length;
    }
    const hit = DAMAGE_2024.exec(text.slice(at));
    if (hit?.[1] && hit[3]) {
      attack.average = Number(hit[1]);
      attack.damage = (hit[2] ?? hit[1]).replace(/\s+/g, '');
      attack.damageType = hit[3].toLowerCase();
      attack.extraDamage = extraDamageIn(sentenceAfter(text, at + hit[0].length - 1));
    }
    out.push(attack);
  }
  for (const m of text.matchAll(ATTACK_2014)) {
    if (!m[1] || !m[3] || !m[4] || !m[5] || !m[7] || !m[9]) continue;
    const reachOrRange = m[5].trim().replace(/\.$/, '');
    const attack: TextAttack = {
      kind: m[1].toLowerCase(),
      toHit: Number(m[3]),
      average: Number(m[7]),
      damage: (m[8] ?? m[7]).replace(/\s+/g, ''),
      damageType: m[9].toLowerCase(),
      extraDamage: extraDamageIn(sentenceAfter(text, m.index + m[0].length - 1)),
      index: m.index,
    };
    if (m[4].toLowerCase() === 'reach') attack.reach = reachOrRange;
    else attack.range = reachOrRange;
    out.push(attack);
  }
  return out.sort((a, b) => a.index - b.index);
}

export type SaveAbility = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface TextSave {
  ability: SaveAbility;
  dc: number;
  halfOnSuccess: boolean;
  index: number;
}

const ABILITY_KEY: Record<string, SaveAbility> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

const SAVE_2024 =
  /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*(\d+)/gi;
const SAVE_2014 =
  /DC\s*(\d+)\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/gi;

function halfOnSuccessNear(text: string, from: number): boolean {
  const window = text.slice(from, from + 400);
  return (
    /Success:\s*Half damage/i.test(window) ||
    /half as much damage on a success/i.test(window) ||
    /half as much damage if it succeeds/i.test(window)
  );
}

/** Finds every save call in a feature's text, in either edition's phrasing. */
export function findSavesInText(text: string): TextSave[] {
  const out: TextSave[] = [];
  for (const m of text.matchAll(SAVE_2024)) {
    const ability = ABILITY_KEY[(m[1] ?? '').toLowerCase()];
    if (!ability || !m[2]) continue;
    out.push({
      ability,
      dc: Number(m[2]),
      halfOnSuccess: halfOnSuccessNear(text, m.index),
      index: m.index,
    });
  }
  for (const m of text.matchAll(SAVE_2014)) {
    const ability = ABILITY_KEY[(m[2] ?? '').toLowerCase()];
    if (!ability || !m[1]) continue;
    out.push({
      ability,
      dc: Number(m[1]),
      halfOnSuccess: halfOnSuccessNear(text, m.index),
      index: m.index,
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Action names mentioned in a Multiattack text, matched on word boundaries (DATA-FORMATS.md §2.3). */
export function multiattackReferences(text: string, actionNames: readonly string[]): string[] {
  const found: Array<{ name: string; index: number }> = [];
  for (const name of actionNames) {
    if (!name || /^multiattack$/i.test(name)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}s?\\b`, 'i');
    const m = re.exec(text);
    if (m) found.push({ name, index: m.index });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.name);
}
