import {
  normalizeCr,
  parseCommaList,
  parseCreatureType,
  parseDamageList,
  parseHp,
  parseAc,
  parseIntOrUndefined,
  parseSaves,
  parseSkills,
  parseSlots,
  parseSpeed,
  parseYesNo,
  xpForCr,
} from '@trifold/rules';
import type { Feature, MonsterData, MonsterRecord, Size } from '@trifold/schema';
import { makeHeader, requireName, splitSource, type NormalizeContext } from './context';
import { buildFeature } from './feature';
import { children, collectExtra, text, textBlocks, type XmlNode } from '../xml/tree';

const KNOWN = new Set([
  'name',
  'size',
  'type',
  'alignment',
  'ac',
  'hp',
  'speed',
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
  'save',
  'skill',
  'resist',
  'vulnerable',
  'immune',
  'conditionImmune',
  'senses',
  'passive',
  'languages',
  'cr',
  'trait',
  'action',
  'reaction',
  'legendary',
  'init',
  'description',
  'environment',
  'spells',
  'slots',
  'sortname',
  'ancestry',
  'npc',
]);

const SIZE_WORDS: Record<string, Size> = {
  t: 'T',
  tiny: 'T',
  s: 'S',
  small: 'S',
  m: 'M',
  medium: 'M',
  l: 'L',
  large: 'L',
  h: 'H',
  huge: 'H',
  g: 'G',
  gargantuan: 'G',
};

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export function normalizeMonster(node: XmlNode, ctx: NormalizeContext): MonsterRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('monster without a name skipped');
    return null;
  }

  const description = splitSource(textBlocks(node, 'description'));
  const header = makeHeader(ctx, name, description);

  const sizeRaw = (text(node, 'size') ?? '').trim().toLowerCase();
  const size = SIZE_WORDS[sizeRaw] ?? null;
  if (sizeRaw && !size) ctx.warn(`unknown size "${sizeRaw}"`);
  if (!sizeRaw) ctx.warn('missing size');

  const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const missingAbilities: string[] = [];
  for (const key of ABILITIES) {
    const value = parseIntOrUndefined(text(node, key));
    if (value === undefined) missingAbilities.push(key);
    else abilities[key] = value;
  }
  if (missingAbilities.length === ABILITIES.length) ctx.warn('missing ability scores');
  else for (const key of missingAbilities) ctx.warn(`missing ${key}`);

  const ac = parseAc(text(node, 'ac'));
  if (!ac) ctx.warn('missing or unreadable ac');
  const hp = parseHp(text(node, 'hp'));
  if (!hp) ctx.warn('missing or unreadable hp');

  const crText = (text(node, 'cr') ?? '').trim();
  const cr = normalizeCr(crText);
  if (cr === null) ctx.warn(crText ? `unknown cr "${crText}"` : 'missing cr');

  let proficiencyBonus: number | undefined;
  const traits: Feature[] = [];
  for (const t of children(node, 'trait')) {
    const feature = buildFeature(t, ctx);
    // 2024 blocks carry the bonus as a trait (`+4`). Companion blocks say "equals your
    // proficiency bonus" instead; those stay visible as ordinary traits.
    if (/^proficiency bonus$/i.test(feature.name.trim())) {
      const value = parseIntOrUndefined(feature.text);
      if (value !== undefined && /^\s*[+-]?\d+\s*$/.test(feature.text)) {
        proficiencyBonus = value;
        continue;
      }
    }
    traits.push(feature);
  }

  const actions: Feature[] = [];
  const bonusActions: Feature[] = [];
  for (const a of children(node, 'action')) {
    const feature = buildFeature(a, ctx);
    if (feature.tags.includes('bonus-action')) bonusActions.push(feature);
    else actions.push(feature);
  }
  const reactions = children(node, 'reaction').map((r) => buildFeature(r, ctx));

  const legendary: MonsterData['legendary'] = { actions: [] };
  const lair: Feature[] = [];
  let sawLegendaryHeader = false;
  for (const l of children(node, 'legendary')) {
    const feature = buildFeature(l, ctx);
    if ((l.attrs['category'] ?? '').toLowerCase() === 'lair') {
      lair.push(feature);
      continue;
    }
    const looksLikeHeader =
      !sawLegendaryHeader &&
      legendary.actions.length === 0 &&
      (/^legendary actions?\b/i.test(feature.displayName) || feature.uses?.per === 'turn');
    if (looksLikeHeader) {
      sawLegendaryHeader = true;
      if (feature.uses?.per === 'turn') legendary.perTurn = feature.uses.count;
      if (feature.text) legendary.header = feature.text;
      continue;
    }
    legendary.actions.push(feature);
  }
  // Blocks without a header (common in third-party files) get the standard pool of 3.
  if (legendary.actions.length > 0 && legendary.perTurn === undefined) legendary.perTurn = 3;

  const hasAttacks = [...actions, ...bonusActions, ...reactions, ...legendary.actions].some(
    (f) => f.attacks.length > 0,
  );

  const { type, subtype } = parseCreatureType(text(node, 'type'));
  const spells = parseCommaList(text(node, 'spells'));
  const slots = parseSlots(text(node, 'slots'));
  if (text(node, 'slots') && slots === null) ctx.warn(`unreadable slots "${text(node, 'slots')}"`);

  const data: MonsterData = {
    size,
    type,
    ...(subtype ? { subtype } : {}),
    alignment: text(node, 'alignment') ?? '',
    ac,
    hp,
    speeds: parseSpeed(text(node, 'speed')),
    abilities,
    saves: parseSaves(text(node, 'save')),
    skills: parseSkills(text(node, 'skill')),
    ...(proficiencyBonus !== undefined ? { proficiencyBonus } : {}),
    senses: text(node, 'senses') ?? '',
    languages: text(node, 'languages') ?? '',
    cr: cr ?? crText,
    xp: xpForCr(cr, { hasAttacks }) ?? 0,
    damageVulnerabilities: parseDamageList(text(node, 'vulnerable')),
    damageResistances: parseDamageList(text(node, 'resist')),
    damageImmunities: parseDamageList(text(node, 'immune')),
    conditionImmunities: parseDamageList(text(node, 'conditionImmune')),
    environment: parseCommaList(text(node, 'environment')).map((e) => e.toLowerCase()),
    isNpc: parseYesNo(text(node, 'npc')),
    traits,
    actions,
    bonusActions,
    reactions,
    legendary,
    lair,
    extra: collectExtra(node, KNOWN),
  };

  const init = parseIntOrUndefined(text(node, 'init'));
  if (init !== undefined) data.initiativeBonus = init;
  const passive = parseIntOrUndefined(text(node, 'passive'));
  if (passive !== undefined) data.passivePerception = passive;
  const ancestry = text(node, 'ancestry');
  if (ancestry) data.ancestry = ancestry;
  const sortName = text(node, 'sortname');
  if (sortName) data.sortName = sortName;
  if (description.text) data.description = description.text;
  if (spells.length > 0 || slots) {
    data.spellcasting = { spells, ...(slots ? { slots } : {}) };
  }

  return { ...header, kind: 'monster', data };
}
