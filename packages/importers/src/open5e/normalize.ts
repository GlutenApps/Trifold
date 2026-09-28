import {
  findAttacksInText,
  findSavesInText,
  normalizeCr,
  normalizeKey,
  parseDamageList,
  parseFeatureName,
  xpForCr,
} from '@trifold/rules';
import type {
  Attack,
  ClassLevel,
  CompendiumRecord,
  Edition,
  Feature,
  MonsterData,
  Roll,
  SimpleTrait,
  Size,
} from '@trifold/schema';
import { RECORD_SCHEMA_VERSION } from '@trifold/schema';
import type {
  O5eAction,
  O5eAttack,
  O5eBackground,
  O5eBase,
  O5eClass,
  O5eCreature,
  O5eFeat,
  O5eItem,
  O5eKind,
  O5eSpecies,
  O5eSpell,
} from './types';

export interface Open5eContext {
  /** Trifold source id, e.g. `srd-2024`. */
  sourceId: string;
  edition: Edition;
  /** Document name used as the citation (`System Reference Document 5.2`). */
  sourceBook: string;
  warn(message: string): void;
}

// ---------- shared ----------

function header(raw: O5eBase, ctx: Open5eContext, kind: string) {
  const name = raw.name.trim();
  return {
    schemaVersion: RECORD_SCHEMA_VERSION as 1,
    // Open5e keys are unique per endpoint only (a monster, an item and a class can share one).
    id: `${ctx.sourceId}:${kind}:${raw.key}`,
    key: normalizeKey(name),
    name,
    displayName: name,
    sourceId: ctx.sourceId,
    sourceBook: ctx.sourceBook,
    edition: ctx.edition,
    tags: [] as string[],
  };
}

function text(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n/g, '\n').trim();
}

function titleCase(snake: string): string {
  return snake
    .split('_')
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const ABILITY_KEY: Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

const SIZE_KEY: Record<string, Size> = {
  tiny: 'T',
  small: 'S',
  medium: 'M',
  large: 'L',
  huge: 'H',
  gargantuan: 'G',
};

function crString(cr: number | null | undefined): string {
  if (cr === null || cr === undefined) return '';
  return normalizeCr(cr) ?? String(cr);
}

function dice(
  count: number | null | undefined,
  die: string | null | undefined,
  bonus: number | null | undefined,
): string | undefined {
  const sides = /^d?(\d+)$/i.exec((die ?? '').trim())?.[1];
  if (!count || !sides) return bonus ? String(bonus) : undefined;
  const mod = bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : '';
  return `${count}d${sides}${mod}`;
}

// ---------- creatures ----------

function usageFrom(action: O5eAction, feature: Feature): void {
  const limits = action.usage_limits;
  if (!limits?.type) return;
  const param = limits.param ?? undefined;
  switch (limits.type) {
    case 'RECHARGE_ON_ROLL':
      if (param && param >= 1 && param <= 6) feature.recharge = { min: param, max: 6 };
      break;
    case 'PER_DAY':
      if (param) feature.uses = { count: param, per: 'day' };
      break;
    case 'RECHARGE_AFTER_REST':
      feature.uses = { count: param ?? 1, per: 'rest' };
      break;
    default:
      break;
  }
}

function attackFrom(
  raw: O5eAttack,
  body: string,
  index: number,
  fallbackLabel: string,
): Attack | null {
  const textAttacks = findAttacksInText(body);
  const fromText = textAttacks[index];
  // The stat block text is the authority; Open5e's structured attack data is incomplete in
  // places (missing damage bonuses, wrong damage types), so it only fills gaps.
  const damage =
    fromText?.damage ?? dice(raw.damage_die_count, raw.damage_die_type, raw.damage_bonus);
  const toHit = fromText?.toHit ?? raw.to_hit_mod ?? undefined;
  if (damage === undefined && toHit === undefined) return null;
  const attack: Attack = {
    label: (raw.name ?? fallbackLabel).replace(/\s+attack$/i, '').trim() || fallbackLabel,
    extraDamage: [],
  };
  if (toHit !== undefined) attack.toHit = toHit;
  if (damage !== undefined) attack.damage = damage;
  // The text is the authority for damage types; structured types are wrong in places.
  const damageType = fromText?.damageType ?? raw.damage_type?.key ?? undefined;
  if (damageType) attack.damageType = damageType.toLowerCase();
  if (fromText?.reach) attack.reach = fromText.reach;
  else if (raw.reach) attack.reach = `${raw.reach} ft`;
  if (fromText?.range) attack.range = fromText.range;
  else if (raw.range)
    attack.range = raw.long_range ? `${raw.range}/${raw.long_range} ft` : `${raw.range} ft`;
  const extra = dice(raw.extra_damage_die_count, raw.extra_damage_die_type, raw.extra_damage_bonus);
  if (fromText && fromText.extraDamage.length > 0) attack.extraDamage = fromText.extraDamage;
  else if (extra) {
    const extraType = raw.extra_damage_type?.key ?? undefined;
    attack.extraDamage = [{ damage: extra, ...(extraType ? { damageType: extraType } : {}) }];
  }
  return attack;
}

function featureFrom(name: string, body: string, action?: O5eAction): Feature {
  const parsed = parseFeatureName(name);
  const feature: Feature = {
    name,
    displayName: parsed.displayName,
    text: body,
    tags: [],
    attacks: [],
    rolls: [],
    saves: findSavesInText(body).map((s) => ({
      ability: s.ability,
      dc: s.dc,
      halfOnSuccess: s.halfOnSuccess,
    })),
  };
  if (parsed.uses) feature.uses = parsed.uses;
  if (parsed.recharge) feature.recharge = parsed.recharge;
  if (parsed.cost !== undefined) feature.cost = parsed.cost;
  if (parsed.isVariant) feature.tags.push('variant');
  if (action) {
    usageFrom(action, feature);
    if ((action.legendary_action_cost ?? 1) > 1)
      feature.cost = action.legendary_action_cost ?? undefined;
    (action.attacks ?? []).forEach((a, i) => {
      const attack = attackFrom(a, body, i, parsed.displayName);
      if (attack) feature.attacks.push(attack);
    });
    if (feature.attacks.length === 0 && !(action.attacks ?? []).length) {
      for (const a of findAttacksInText(body)) {
        feature.attacks.push({
          label: parsed.displayName,
          toHit: a.toHit,
          damage: a.damage,
          damageType: a.damageType,
          ...(a.reach ? { reach: a.reach } : {}),
          ...(a.range ? { range: a.range } : {}),
          extraDamage: a.extraDamage,
        });
      }
    }
  }
  return feature;
}

function sensesText(raw: O5eCreature): string {
  const parts: string[] = [];
  if (raw.blindsight_range) parts.push(`blindsight ${raw.blindsight_range} ft.`);
  if (raw.darkvision_range) parts.push(`darkvision ${raw.darkvision_range} ft.`);
  if (raw.tremorsense_range) parts.push(`tremorsense ${raw.tremorsense_range} ft.`);
  if (raw.truesight_range) parts.push(`truesight ${raw.truesight_range} ft.`);
  return parts.join(', ');
}

export function normalizeCreature(raw: O5eCreature, ctx: Open5eContext): CompendiumRecord {
  const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  for (const [name, key] of Object.entries(ABILITY_KEY)) {
    const value = raw.ability_scores?.[name];
    if (typeof value === 'number') abilities[key] = value;
    else ctx.warn(`${raw.name}: missing ${key}`);
  }
  const saves: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>> = {};
  for (const [name, value] of Object.entries(raw.saving_throws ?? {})) {
    const key = ABILITY_KEY[name];
    if (key && typeof value === 'number') saves[key] = value;
  }
  const skills: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw.skill_bonuses ?? {})) {
    if (typeof value === 'number') skills[titleCase(name)] = value;
  }

  const traits: Feature[] = (raw.traits ?? []).map((t) => featureFrom(text(t.name), text(t.desc)));
  const actions: Feature[] = [];
  const bonusActions: Feature[] = [];
  const reactions: Feature[] = [];
  const legendaryActions: Feature[] = [];
  const lair: Feature[] = [];
  for (const a of raw.actions ?? []) {
    const feature = featureFrom(text(a.name), text(a.desc), a);
    switch ((a.action_type ?? 'ACTION').toUpperCase()) {
      case 'BONUS_ACTION':
        feature.tags.push('bonus-action');
        bonusActions.push(feature);
        break;
      case 'REACTION':
        reactions.push(feature);
        break;
      case 'LEGENDARY_ACTION':
        legendaryActions.push(feature);
        break;
      case 'LAIR_ACTION':
        lair.push(feature);
        break;
      default:
        actions.push(feature);
    }
  }
  const hasAttacks = [...actions, ...bonusActions, ...reactions, ...legendaryActions].some(
    (f) => f.attacks.length > 0,
  );

  const cr = crString(raw.challenge_rating);
  if (!cr) ctx.warn(`${raw.name}: missing cr`);
  const sizeKey = (raw.size?.key ?? '').toLowerCase();
  const size = SIZE_KEY[sizeKey] ?? null;
  if (!size) ctx.warn(`${raw.name}: unknown size "${sizeKey}"`);

  const speed = raw.speed ?? {};
  const num = (v: unknown): number | undefined => (typeof v === 'number' && v > 0 ? v : undefined);
  const speeds: MonsterData['speeds'] = {
    notes: [],
    raw: Object.entries(speed)
      .filter(([k, v]) => k !== 'unit' && typeof v === 'number' && v > 0)
      .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
      .join(', '),
  };
  if (num(speed['walk']) !== undefined) speeds.walk = num(speed['walk']);
  if (num(speed['fly']) !== undefined) speeds.fly = num(speed['fly']);
  if (num(speed['swim']) !== undefined) speeds.swim = num(speed['swim']);
  if (num(speed['climb']) !== undefined) speeds.climb = num(speed['climb']);
  if (num(speed['burrow']) !== undefined) speeds.burrow = num(speed['burrow']);
  if (raw.speed_all?.['hover'] === true) speeds.hover = true;

  const ri = raw.resistances_and_immunities ?? {};
  const description = text(raw.desc);
  const data: MonsterData = {
    size,
    type: (raw.type?.key ?? raw.type?.name ?? '').toLowerCase(),
    ...(raw.subcategory ? { subtype: raw.subcategory } : {}),
    alignment: text(raw.alignment),
    ac:
      raw.armor_class != null
        ? { value: raw.armor_class, ...(raw.armor_detail ? { note: raw.armor_detail } : {}) }
        : null,
    hp:
      raw.hit_points != null
        ? {
            average: raw.hit_points,
            ...(raw.hit_dice ? { formula: raw.hit_dice.replace(/\s+/g, '') } : {}),
          }
        : null,
    speeds,
    abilities,
    saves,
    skills,
    ...(raw.proficiency_bonus != null ? { proficiencyBonus: raw.proficiency_bonus } : {}),
    ...(raw.initiative_bonus != null ? { initiativeBonus: raw.initiative_bonus } : {}),
    senses: sensesText(raw),
    ...(raw.passive_perception != null ? { passivePerception: raw.passive_perception } : {}),
    languages: text(raw.languages?.as_string),
    cr,
    xp: raw.experience_points ?? xpForCr(cr, { hasAttacks }) ?? 0,
    damageVulnerabilities: parseDamageList(ri.damage_vulnerabilities_display ?? ''),
    damageResistances: parseDamageList(ri.damage_resistances_display ?? ''),
    damageImmunities: parseDamageList(ri.damage_immunities_display ?? ''),
    conditionImmunities: parseDamageList(ri.condition_immunities_display ?? ''),
    environment: (raw.environments ?? [])
      .map((e) => (e.key ?? e.name ?? '').toLowerCase())
      .filter(Boolean),
    isNpc: false,
    ...(description ? { description } : {}),
    traits,
    actions,
    bonusActions,
    reactions,
    legendary: { ...(legendaryActions.length ? { perTurn: 3 } : {}), actions: legendaryActions },
    lair,
    extra: {},
  };
  return { ...header(raw, ctx, 'monster'), kind: 'monster', data };
}

// ---------- spells ----------

const SCHOOL_CODE: Record<string, string> = {
  abjuration: 'A',
  conjuration: 'C',
  divination: 'D',
  enchantment: 'EN',
  evocation: 'EV',
  illusion: 'I',
  necromancy: 'N',
  transmutation: 'T',
};

export function normalizeSpell(raw: O5eSpell, ctx: Open5eContext): CompendiumRecord {
  const components: string[] = [];
  if (raw.verbal) components.push('V');
  if (raw.somatic) components.push('S');
  if (raw.material) components.push(raw.material_specified ? `M (${raw.material_specified})` : 'M');
  const duration = text(raw.duration);
  const rolls: Roll[] = [];
  const damageTypes = (raw.damage_types ?? [])
    .map((d) => (typeof d === 'string' ? d : (d.name ?? d.key ?? '')))
    .filter(Boolean)
    .join(', ');
  const level = raw.level ?? 0;
  if (raw.damage_roll) {
    rolls.push({
      dice: raw.damage_roll.replace(/\s+/g, ''),
      description: damageTypes ? `${damageTypes} damage` : 'Damage',
      level,
    });
  }
  for (const opt of raw.casting_options ?? []) {
    const m = /^slot_level_(\d+)$/.exec(opt.type ?? '');
    if (m?.[1] && opt.damage_roll) {
      rolls.push({
        dice: opt.damage_roll.replace(/\s+/g, ''),
        description: damageTypes ? `${damageTypes} damage` : 'Damage',
        level: Number(m[1]),
      });
    }
  }
  const body = [
    text(raw.desc),
    raw.higher_level ? `Using a Higher-Level Spell Slot. ${text(raw.higher_level)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const castingTime = text(raw.casting_time);
  return {
    ...header(raw, ctx, 'spell'),
    kind: 'spell',
    data: {
      level: Math.min(9, Math.max(0, level)),
      school: SCHOOL_CODE[(raw.school?.key ?? '').toLowerCase()] ?? '',
      ritual: raw.ritual === true,
      time: castingTime
        ? castingTime[0]!.toUpperCase() +
          castingTime.slice(1) +
          (raw.reaction_condition ? `, ${raw.reaction_condition}` : '')
        : '',
      range: text(raw.range_text),
      components: components.join(', '),
      duration: raw.concentration ? `Concentration, ${duration}` : duration,
      classes: (raw.classes ?? []).map((c) => c.name ?? '').filter(Boolean),
      text: body,
      rolls,
      modifiers: [],
      extra: {},
    },
  };
}

// ---------- items ----------

const CATEGORY_CODE: Record<string, string> = {
  armor: 'LA',
  shield: 'S',
  weapon: 'M',
  ammunition: 'A',
  potion: 'P',
  scroll: 'SC',
  'wondrous-item': 'W',
  staff: 'ST',
  rod: 'RD',
  wand: 'WD',
  ring: 'RG',
};
const MAGIC_CATEGORIES = new Set([
  'potion',
  'scroll',
  'wondrous-item',
  'staff',
  'rod',
  'wand',
  'ring',
]);
const DAMAGE_CODE: Record<string, string> = {
  bludgeoning: 'B',
  piercing: 'P',
  slashing: 'S',
  acid: 'A',
  cold: 'C',
  fire: 'F',
  force: 'FC',
  lightning: 'L',
  necrotic: 'N',
  poison: 'PS',
  psychic: 'PY',
  radiant: 'R',
  thunder: 'T',
};
const PROPERTY_CODE: Record<string, string> = {
  ammunition: 'A',
  finesse: 'F',
  heavy: 'H',
  light: 'L',
  loading: 'LD',
  reach: 'R',
  special: 'S',
  thrown: 'T',
  'two-handed': '2H',
  versatile: 'V',
};

export function normalizeItem(raw: O5eItem, ctx: Open5eContext): CompendiumRecord {
  const category = (raw.category?.key ?? '').toLowerCase();
  let typeCode = CATEGORY_CODE[category] ?? 'G';
  const properties: string[] = [];
  let dmg2: string | undefined;
  let range: string | undefined;
  if (raw.weapon) {
    for (const p of raw.weapon.properties ?? []) {
      const name = (p.property?.name ?? '').toLowerCase();
      const code = PROPERTY_CODE[name];
      if (code) properties.push(code);
      if (name === 'versatile' && p.detail) dmg2 = p.detail.replace(/\s+/g, '');
      if ((name === 'ammunition' || name === 'thrown') && p.detail) range = p.detail;
    }
    if (raw.weapon.is_martial) properties.push('M');
    if (properties.includes('A')) typeCode = 'R';
  }
  if (raw.armor) {
    const kind = (raw.armor.category ?? '').toLowerCase();
    typeCode = kind === 'heavy' ? 'HA' : kind === 'medium' ? 'MA' : kind === 'shield' ? 'S' : 'LA';
  }
  const body = text(raw.desc);
  const magic = MAGIC_CATEGORIES.has(category) || /\bis a magic item\b/i.test(body);
  const weight = raw.weight != null ? Number(raw.weight) : Number.NaN;
  const cost = raw.cost != null ? Number(raw.cost) : Number.NaN;
  const rarity = typeof raw.rarity === 'string' ? raw.rarity : (raw.rarity?.key ?? undefined);
  const dmgType = raw.weapon?.damage_type?.key
    ? DAMAGE_CODE[raw.weapon.damage_type.key.toLowerCase()]
    : undefined;
  return {
    ...header(raw, ctx, 'item'),
    kind: 'item',
    data: {
      typeCode,
      magic,
      ...(rarity ? { rarity: rarity.replace('-', ' ') } : {}),
      ...(raw.requires_attunement != null
        ? { requiresAttunement: Boolean(raw.requires_attunement) }
        : {}),
      ...(Number.isFinite(weight) ? { weight } : {}),
      ...(Number.isFinite(cost) ? { value: cost } : {}),
      ...(raw.armor?.ac_base != null ? { ac: raw.armor.ac_base } : {}),
      ...(raw.armor?.strength_score_required != null
        ? { strength: raw.armor.strength_score_required }
        : {}),
      stealthDisadvantage: raw.armor?.grants_stealth_disadvantage === true,
      ...(raw.weapon?.damage_dice ? { dmg1: raw.weapon.damage_dice.replace(/\s+/g, '') } : {}),
      ...(dmg2 ? { dmg2 } : {}),
      ...(dmgType ? { dmgType } : {}),
      properties,
      ...(range ? { range } : {}),
      text: body,
      rolls: [],
      modifiers: [],
      contents: [],
      extra: category ? { category: [category] } : {},
    },
  };
}

// ---------- feats, species, backgrounds, classes ----------

export function normalizeFeat(raw: O5eFeat, ctx: Open5eContext): CompendiumRecord {
  const body = [text(raw.desc), ...(raw.benefits ?? []).map((b) => text(b.desc))]
    .filter(Boolean)
    .join('\n\n');
  const prerequisite = text(raw.prerequisite);
  return {
    ...header(raw, ctx, 'feat'),
    kind: 'feat',
    data: {
      ...(prerequisite ? { prerequisite } : {}),
      text: body,
      rolls: [],
      modifiers: [],
      extra: raw.type ? { type: [raw.type] } : {},
    },
  };
}

function simpleTraits(
  items: Array<{ name?: string | null; desc?: string | null; type?: string | null }>,
): SimpleTrait[] {
  return items.map((t) => ({
    name: text(t.name),
    text: text(t.desc),
    ...(t.type ? { category: t.type.toLowerCase() } : {}),
    rolls: [],
    modifiers: [],
  }));
}

export function normalizeSpecies(raw: O5eSpecies, ctx: Open5eContext): CompendiumRecord {
  const traits = simpleTraits(raw.traits ?? []);
  const size = traits.find((t) => t.category === 'size')?.text;
  const speed = traits.find((t) => t.category === 'speed')?.text;
  const parent = raw.subspecies_of?.name ?? undefined;
  const record = {
    ...header(raw, ctx, 'species'),
    kind: 'species' as const,
    data: {
      ...(size ? { size } : {}),
      ...(speed ? { speed } : {}),
      spells: [],
      ...(parent ? { ancestry: parent } : {}),
      traits: text(raw.desc)
        ? [
            {
              name: 'Description',
              text: text(raw.desc),
              category: 'description',
              rolls: [],
              modifiers: [],
            },
            ...traits,
          ]
        : traits,
      extra: {},
    },
  };
  if (parent) record.tags.push('subspecies');
  return record;
}

export function normalizeBackground(raw: O5eBackground, ctx: Open5eContext): CompendiumRecord {
  const benefits = raw.benefits ?? [];
  const proficiency =
    benefits.find((b) => (b.type ?? '') === 'skill_proficiency')?.desc ?? undefined;
  return {
    ...header(raw, ctx, 'background'),
    kind: 'background',
    data: {
      ...(proficiency ? { proficiency: text(proficiency) } : {}),
      traits: simpleTraits(benefits),
      modifiers: [],
      extra: {},
    },
  };
}

export function normalizeClass(raw: O5eClass, ctx: Open5eContext): CompendiumRecord {
  const byLevel = new Map<number, ClassLevel>();
  const level = (n: number): ClassLevel => {
    let entry = byLevel.get(n);
    if (!entry) {
      entry = { level: n, scoreImprovement: false, features: [], counters: [] };
      byLevel.set(n, entry);
    }
    return entry;
  };
  for (const f of raw.features ?? []) {
    if ((f.feature_type ?? '') !== 'CLASS_LEVEL_FEATURE') continue;
    for (const g of f.gained_at ?? []) {
      if (!g.level || g.level < 1 || g.level > 20) continue;
      const entry = level(g.level);
      const name = text(f.name);
      if (/^ability score improvement$/i.test(name)) entry.scoreImprovement = true;
      entry.features.push({
        name,
        text: text(f.desc),
        optional: false,
        ...(g.detail ? { special: g.detail } : {}),
        rolls: [],
        modifiers: [],
      });
    }
  }
  const hd = /d?(\d+)/i.exec(raw.hit_dice ?? '')?.[1];
  const parent = raw.subclass_of?.name ?? undefined;
  const record = {
    ...header(raw, ctx, 'class'),
    kind: 'class' as const,
    data: {
      ...(hd ? { hd: Number(hd) } : {}),
      ...(raw.saving_throws?.length
        ? {
            proficiency: raw.saving_throws
              .map((s) => s.name ?? '')
              .filter(Boolean)
              .join(', '),
          }
        : {}),
      levels: [...byLevel.values()].sort((a, b) => a.level - b.level),
      extra: {
        ...(parent ? { subclassOf: [parent] } : {}),
        ...(raw.caster_type ? { casterType: [raw.caster_type] } : {}),
      },
    },
  };
  if (parent) record.tags.push('subclass');
  return record;
}

/** Dispatches one raw Open5e record by endpoint kind. */
export function normalizeOpen5e(kind: O5eKind, raw: O5eBase, ctx: Open5eContext): CompendiumRecord {
  switch (kind) {
    case 'creatures':
      return normalizeCreature(raw as O5eCreature, ctx);
    case 'spells':
      return normalizeSpell(raw as O5eSpell, ctx);
    case 'items':
      return normalizeItem(raw as O5eItem, ctx);
    case 'feats':
      return normalizeFeat(raw as O5eFeat, ctx);
    case 'species':
      return normalizeSpecies(raw as O5eSpecies, ctx);
    case 'backgrounds':
      return normalizeBackground(raw as O5eBackground, ctx);
    case 'classes':
      return normalizeClass(raw as O5eClass, ctx);
  }
}
