import {
  parseCommaList,
  parseIntOrUndefined,
  parseNumberOrUndefined,
  parseSlots,
  parseYesNo,
} from '@trifold/rules';
import type {
  BackgroundRecord,
  ClassLevel,
  ClassRecord,
  FeatRecord,
  ItemRecord,
  SimpleTrait,
  SpeciesRecord,
  SpellRecord,
} from '@trifold/schema';
import {
  makeHeader,
  readModifiers,
  readRolls,
  requireName,
  splitSource,
  type NormalizeContext,
} from './context';
import { children, collectExtra, text, textBlocks, type XmlNode } from '../xml/tree';

// ---------- spell (DATA-FORMATS.md §2.7) ----------

const SPELL_KNOWN = new Set([
  'name',
  'level',
  'school',
  'ritual',
  'time',
  'range',
  'components',
  'duration',
  'classes',
  'text',
  'roll',
  'modifier',
  'special',
]);

export function normalizeSpell(node: XmlNode, ctx: NormalizeContext): SpellRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('spell without a name skipped');
    return null;
  }
  const body = splitSource(textBlocks(node));
  const header = makeHeader(ctx, name, body);
  let level = parseIntOrUndefined(text(node, 'level'));
  if (level === undefined || level < 0 || level > 9) {
    ctx.warn(`missing or unreadable level "${text(node, 'level') ?? ''}"`);
    level = 0;
  }
  const special = text(node, 'special');
  return {
    ...header,
    kind: 'spell',
    data: {
      level,
      school: (text(node, 'school') ?? '').toUpperCase(),
      ritual: parseYesNo(text(node, 'ritual')),
      time: text(node, 'time') ?? '',
      range: text(node, 'range') ?? '',
      components: text(node, 'components') ?? '',
      duration: text(node, 'duration') ?? '',
      classes: parseCommaList(text(node, 'classes')),
      text: body.text,
      rolls: readRolls(node),
      modifiers: readModifiers(node, ctx),
      ...(special ? { special } : {}),
      extra: collectExtra(node, SPELL_KNOWN),
    },
  };
}

// ---------- item (DATA-FORMATS.md §2.8) ----------

const ITEM_KNOWN = new Set([
  'name',
  'type',
  'magic',
  'detail',
  'weight',
  'value',
  'ac',
  'strength',
  'stealth',
  'dmg1',
  'dmg2',
  'dmgType',
  'property',
  'range',
  'text',
  'roll',
  'modifier',
]);

const RARITY = /(very rare|uncommon|common|rare|legendary|artifact)/i;

export function normalizeItem(node: XmlNode, ctx: NormalizeContext): ItemRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('item without a name skipped');
    return null;
  }
  const body = splitSource(textBlocks(node));
  const header = makeHeader(ctx, name, body);
  const typeCode = (text(node, 'type') ?? '').toUpperCase();
  if (!typeCode) ctx.warn('missing type code');

  const detail = text(node, 'detail');
  const rarity = detail ? RARITY.exec(detail)?.[1]?.toLowerCase() : undefined;
  const requiresAttunement = detail ? /requires attunement/i.test(detail) : undefined;

  const weight = parseNumberOrUndefined(text(node, 'weight'));
  const value = parseNumberOrUndefined(text(node, 'value'));
  const ac = parseIntOrUndefined(text(node, 'ac'));
  const strength = parseIntOrUndefined(text(node, 'strength'));
  const dmg1 = text(node, 'dmg1')?.replace(/\s+/g, '');
  const dmg2 = text(node, 'dmg2')?.replace(/\s+/g, '');
  const dmgType = text(node, 'dmgType')?.toUpperCase();
  const range = text(node, 'range');

  return {
    ...header,
    kind: 'item',
    data: {
      typeCode,
      magic: parseYesNo(text(node, 'magic')),
      ...(detail ? { detail } : {}),
      ...(rarity ? { rarity } : {}),
      ...(requiresAttunement !== undefined ? { requiresAttunement } : {}),
      ...(weight !== undefined ? { weight } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(ac !== undefined ? { ac } : {}),
      ...(strength !== undefined ? { strength } : {}),
      stealthDisadvantage: parseYesNo(text(node, 'stealth')),
      ...(dmg1 ? { dmg1 } : {}),
      ...(dmg2 ? { dmg2 } : {}),
      ...(dmgType ? { dmgType } : {}),
      properties: parseCommaList(text(node, 'property')).map((p) => p.toUpperCase()),
      ...(range ? { range } : {}),
      text: body.text,
      rolls: readRolls(node),
      modifiers: readModifiers(node, ctx),
      contents: [],
      extra: collectExtra(node, ITEM_KNOWN),
    },
  };
}

/** `<container>` equipment packs (SRD file only) become gear items with a contents list. */
export function normalizeContainer(node: XmlNode, ctx: NormalizeContext): ItemRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('container without a name skipped');
    return null;
  }
  const body = splitSource(textBlocks(node));
  const header = makeHeader(ctx, name, body);
  const contents = children(node, 'item')
    .map((i) => ({
      name: text(i, 'name') ?? '',
      quantity: parseIntOrUndefined(text(i, 'quantity')) ?? 1,
    }))
    .filter((c) => c.name);
  const listed = contents.map((c) => `${c.quantity} × ${c.name}`).join(', ');
  return {
    ...header,
    kind: 'item',
    data: {
      typeCode: 'G',
      magic: false,
      stealthDisadvantage: false,
      properties: [],
      text: body.text || (listed ? `Contents: ${listed}.` : ''),
      rolls: [],
      modifiers: [],
      contents,
      extra: collectExtra(node, new Set(['name', 'text', 'item'])),
    },
  };
}

// ---------- feat (DATA-FORMATS.md §2.13) ----------

const FEAT_KNOWN = new Set([
  'name',
  'prerequisite',
  'text',
  'modifier',
  'proficiency',
  'special',
  'roll',
]);

export function normalizeFeat(node: XmlNode, ctx: NormalizeContext): FeatRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('feat without a name skipped');
    return null;
  }
  const body = splitSource(textBlocks(node));
  const header = makeHeader(ctx, name, body);
  const prerequisite = text(node, 'prerequisite');
  const proficiency = text(node, 'proficiency');
  const special = text(node, 'special');
  return {
    ...header,
    kind: 'feat',
    data: {
      ...(prerequisite ? { prerequisite } : {}),
      text: body.text,
      ...(proficiency ? { proficiency } : {}),
      ...(special ? { special } : {}),
      rolls: readRolls(node),
      modifiers: readModifiers(node, ctx),
      extra: collectExtra(node, FEAT_KNOWN),
    },
  };
}

// ---------- traits shared by species and backgrounds ----------

function readTraits(node: XmlNode, ctx: NormalizeContext): SimpleTrait[] {
  return children(node, 'trait').map((t) => {
    const category = t.attrs['category'];
    return {
      name: text(t, 'name') ?? '',
      text: textBlocks(t),
      ...(category ? { category } : {}),
      rolls: readRolls(t),
      modifiers: readModifiers(t, ctx),
    };
  });
}

function optionalText(node: XmlNode, name: string): Record<string, string> {
  const value = text(node, name);
  return value ? { [name]: value } : {};
}

// ---------- race → species (DATA-FORMATS.md §2.11) ----------

const SPECIES_KNOWN = new Set([
  'name',
  'size',
  'speed',
  'ability',
  'proficiency',
  'spellAbility',
  'spells',
  'languages',
  'weapons',
  'tools',
  'armor',
  'resist',
  'vulnerable',
  'conditionResist',
  'conditionImmune',
  'speedOther',
  'trait',
  'ancestry',
  'text',
]);

export function normalizeSpecies(node: XmlNode, ctx: NormalizeContext): SpeciesRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('race without a name skipped');
    return null;
  }
  const traits = readTraits(node, ctx);
  const cited = splitSource(traits.map((t) => t.text).join('\n\n'));
  const header = makeHeader(ctx, name, cited);
  return {
    ...header,
    kind: 'species',
    data: {
      ...optionalText(node, 'size'),
      ...optionalText(node, 'speed'),
      ...optionalText(node, 'ability'),
      ...optionalText(node, 'proficiency'),
      ...optionalText(node, 'spellAbility'),
      spells: parseCommaList(text(node, 'spells')),
      ...optionalText(node, 'languages'),
      ...optionalText(node, 'weapons'),
      ...optionalText(node, 'tools'),
      ...optionalText(node, 'armor'),
      ...optionalText(node, 'resist'),
      ...optionalText(node, 'vulnerable'),
      ...optionalText(node, 'conditionResist'),
      ...optionalText(node, 'conditionImmune'),
      ...optionalText(node, 'speedOther'),
      ...optionalText(node, 'ancestry'),
      traits,
      extra: collectExtra(node, SPECIES_KNOWN),
    },
  };
}

// ---------- background (DATA-FORMATS.md §2.13) ----------

const BACKGROUND_KNOWN = new Set(['name', 'proficiency', 'trait', 'modifier', 'ancestry', 'text']);

export function normalizeBackground(node: XmlNode, ctx: NormalizeContext): BackgroundRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('background without a name skipped');
    return null;
  }
  const traits = readTraits(node, ctx);
  const cited = splitSource(traits.map((t) => t.text).join('\n\n'));
  const header = makeHeader(ctx, name, cited);
  return {
    ...header,
    kind: 'background',
    data: {
      ...optionalText(node, 'proficiency'),
      ...optionalText(node, 'ancestry'),
      traits,
      modifiers: readModifiers(node, ctx),
      extra: collectExtra(node, BACKGROUND_KNOWN),
    },
  };
}

// ---------- class (DATA-FORMATS.md §2.12) ----------

const CLASS_KNOWN = new Set([
  'name',
  'hd',
  'proficiency',
  'numSkills',
  'armor',
  'weapons',
  'tools',
  'wealth',
  'spellAbility',
  'slotsReset',
  'autolevel',
  'text',
]);

export function normalizeClass(node: XmlNode, ctx: NormalizeContext): ClassRecord | null {
  const name = requireName(node);
  if (!name) {
    ctx.warn('class without a name skipped');
    return null;
  }
  const header = makeHeader(ctx, name, {});
  const levels: ClassLevel[] = [];
  for (const al of children(node, 'autolevel')) {
    const level = parseIntOrUndefined(al.attrs['level']);
    if (level === undefined || level < 1 || level > 20) {
      ctx.warn(`autolevel with bad level "${al.attrs['level'] ?? ''}" skipped`);
      continue;
    }
    const slotsNode = children(al, 'slots')[0];
    const slotValues = slotsNode ? parseSlots(slotsNode.text) : null;
    if (slotsNode && !slotValues)
      ctx.warn(`level ${level}: unreadable slots "${slotsNode.text.trim()}"`);
    levels.push({
      level,
      scoreImprovement: parseYesNo(al.attrs['scoreImprovement']),
      features: children(al, 'feature').map((f) => {
        const special = text(f, 'special');
        return {
          name: text(f, 'name') ?? '',
          text: textBlocks(f),
          optional: parseYesNo(f.attrs['optional']),
          ...(special ? { special } : {}),
          rolls: readRolls(f),
          modifiers: readModifiers(f, ctx),
        };
      }),
      ...(slotValues
        ? { slots: { values: slotValues, optional: parseYesNo(slotsNode?.attrs['optional']) } }
        : {}),
      counters: children(al, 'counter').map((c) => {
        const reset = text(c, 'reset');
        const subclass = text(c, 'subclass');
        return {
          name: text(c, 'name') ?? '',
          value: parseIntOrUndefined(text(c, 'value')) ?? 0,
          ...(reset ? { reset } : {}),
          ...(subclass ? { subclass } : {}),
        };
      }),
    });
  }
  const hd = parseIntOrUndefined(text(node, 'hd'));
  const numSkills = parseIntOrUndefined(text(node, 'numSkills'));
  return {
    ...header,
    kind: 'class',
    data: {
      ...(hd !== undefined ? { hd } : {}),
      ...optionalText(node, 'proficiency'),
      ...(numSkills !== undefined ? { numSkills } : {}),
      ...optionalText(node, 'armor'),
      ...optionalText(node, 'weapons'),
      ...optionalText(node, 'tools'),
      ...optionalText(node, 'wealth'),
      ...optionalText(node, 'spellAbility'),
      ...optionalText(node, 'slotsReset'),
      levels,
      extra: collectExtra(node, CLASS_KNOWN),
    },
  };
}
