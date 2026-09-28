import {
  findAttacksInText,
  findSavesInText,
  parseAttackTriple,
  parseFeatureName,
  parseRechargeCode,
  type TextAttack,
} from '@trifold/rules';
import type { Attack, Feature } from '@trifold/schema';
import type { NormalizeContext } from './context';
import { children, text, textBlocks, type XmlNode } from '../xml/tree';

/** `<trait>`, `<action>`, `<reaction>`, `<legendary>` → Feature (DATA-FORMATS.md §2.3–2.5). */
export function buildFeature(node: XmlNode, ctx: NormalizeContext): Feature {
  const rawName = text(node, 'name') ?? '';
  const parsed = parseFeatureName(rawName);
  const body = textBlocks(node);

  const feature: Feature = {
    name: rawName,
    displayName: parsed.displayName,
    text: body,
    tags: [],
    attacks: [],
    rolls: [],
    saves: [],
  };
  if (parsed.uses) feature.uses = parsed.uses;
  if (parsed.recharge) feature.recharge = parsed.recharge;
  if (parsed.cost !== undefined) feature.cost = parsed.cost;
  if (parsed.isVariant) feature.tags.push('variant');
  if (parsed.isBonusAction) feature.tags.push('bonus-action');

  const code = text(node, 'recharge');
  if (code) {
    const rc = parseRechargeCode(code);
    if (rc) {
      if (rc.recharge) feature.recharge = rc.recharge;
      if (rc.uses) feature.uses = rc.uses;
    } else {
      ctx.warn(`"${rawName}": unknown recharge code "${code}"`);
    }
  }

  const textAttacks = findAttacksInText(body);
  feature.saves = findSavesInText(body).map((s) => ({
    ability: s.ability,
    dc: s.dc,
    halfOnSuccess: s.halfOnSuccess,
  }));

  const triples = children(node, 'attack');
  let attackIndex = 0;
  for (const t of triples) {
    const triple = parseAttackTriple(t.text);
    if (!triple) {
      ctx.warn(`"${rawName}": unreadable attack "${t.text.trim()}"`);
      continue;
    }
    // A triple is an attack when it has a to-hit or the text reads like an attack; otherwise it
    // is a plain roll button (`Heal||1d10`, `Days||5d10`).
    const isAttack = triple.toHit !== undefined || textAttacks.length > 0;
    if (!isAttack) {
      if (triple.damage) {
        feature.rolls.push({ label: triple.label || parsed.displayName, dice: triple.damage });
      }
      continue;
    }
    const fromText = textAttacks[attackIndex];
    attackIndex += 1;
    feature.attacks.push(mergeAttack(triple, fromText));
  }

  if (feature.attacks.length === 0 && triples.length === 0) {
    for (const a of textAttacks) {
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

  return feature;
}

const TYPE_LABEL = /^([A-Za-z]+) damage$/i;

function mergeAttack(
  triple: { label: string; toHit?: number; damage?: string },
  fromText: TextAttack | undefined,
): Attack {
  const attack: Attack = { label: triple.label, extraDamage: [] };
  if (triple.damage) attack.damage = triple.damage;
  else if (fromText) attack.damage = fromText.damage;

  if (triple.toHit !== undefined) attack.toHit = triple.toHit;
  else if (fromText) attack.toHit = fromText.toHit;

  const labelType = TYPE_LABEL.exec(triple.label)?.[1];
  if (labelType) attack.damageType = labelType.toLowerCase();
  else if (fromText) attack.damageType = fromText.damageType;

  if (fromText) {
    if (fromText.reach) attack.reach = fromText.reach;
    if (fromText.range) attack.range = fromText.range;
    attack.extraDamage = fromText.extraDamage;
  }
  return attack;
}

/**
 * A feature from a name and body alone (homebrew editor, DESIGN.md §6.2): the same parse the
 * XML importer runs, so attacks, saves, uses and recharge come out of the text.
 */
export function featureFromText(name: string, body: string): Feature {
  const node: XmlNode = {
    name: 'trait',
    attrs: {},
    text: '',
    children: [
      { name: 'name', attrs: {}, text: name, children: [] },
      ...body.split(/\n{2,}/).map((t) => ({ name: 'text', attrs: {}, text: t, children: [] })),
    ],
  };
  return buildFeature(node, { warn: () => undefined } as unknown as NormalizeContext);
}
