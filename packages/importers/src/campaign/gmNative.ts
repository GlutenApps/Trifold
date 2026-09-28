import type { XmlNode } from '../xml/tree';

/**
 * Game Master 5e's native campaign shape (verified against a real export, 2026-09-27; see
 * DATA-FORMATS.md §3.2). PCs, NPCs and inline encounter monsters carry `<abilities>` as a comma
 * list, `<hpMax>`/`<hd>`, `<armor>` as the AC note, structured `<savingThrow>`/`<skill>` entries
 * keyed by number, numeric `<size>`/`<cr>`/`<school>`, a `Source` trait, structured
 * `<attack><atk/><dmg/>` and nested `<spell>` records. These helpers rewrite such nodes into the
 * compendium XML shape so the ordinary monster and spell normalizers apply unchanged.
 */

/** 0-based, alphabetical, as Game Master numbers them. */
export const GM_SKILLS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
] as const;

export const GM_ABILITIES = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'] as const;
const ABILITY_TAGS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** `<size>` 0–5 = T S M L H G (observed: 1 on a halfling, 3 on a brown bear; absent = Medium). */
export const GM_SIZES = ['T', 'S', 'M', 'L', 'H', 'G'] as const;

/** `<school>` is 1-based alphabetical (observed: 5 = evocation, 8 = transmutation). */
export const GM_SCHOOLS = ['', 'A', 'C', 'D', 'EN', 'EV', 'I', 'N', 'T'] as const;

/**
 * `<cr>`: observed -1 on CR 1/4 creatures, 0 on CR 1/2, 2 and 6 on CR 2 and 6, and -2 on a
 * sheep. The fractional codes below are the consistent reading; (verify) -3 and -2.
 */
export function gmCrToString(code: string | undefined): string | undefined {
  if (code === undefined || code.trim() === '') return undefined;
  const n = Number.parseInt(code, 10);
  if (!Number.isFinite(n)) return code.trim();
  if (n <= -3) return '0';
  if (n === -2) return '1/8';
  if (n === -1) return '1/4';
  if (n === 0) return '1/2';
  return String(n);
}

const lower = (s: string) => s.toLowerCase();

function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => lower(c.name) === lower(name));
}

function text(node: XmlNode, name: string): string | undefined {
  const c = child(node, name);
  return c ? c.text.trim() : undefined;
}

function leaf(name: string, value: string): XmlNode {
  return { name, attrs: {}, text: value, children: [] };
}

/** True for PCs, NPCs and inline monsters written by Game Master (rather than compendium XML). */
export function isGmNative(node: XmlNode): boolean {
  return ['abilities', 'hpMax', 'savingThrow'].some((n) => child(node, n) !== undefined);
}

function abilityLeaves(node: XmlNode): XmlNode[] {
  const csv = text(node, 'abilities');
  if (!csv) return [];
  const values = csv.split(',').map((v) => v.trim());
  return ABILITY_TAGS.flatMap((tag, i) => (values[i] ? [leaf(tag, values[i]!)] : []));
}

function savesText(node: XmlNode): string {
  const parts: string[] = [];
  for (const st of node.children.filter((c) => lower(c.name) === 'savingthrow')) {
    const ability = Number.parseInt(text(st, 'ability') ?? '0', 10);
    const modifier = Number.parseInt(text(st, 'modifier') ?? '', 10);
    const name = GM_ABILITIES[ability];
    if (!name || !Number.isFinite(modifier)) continue;
    parts.push(`${name} ${modifier >= 0 ? '+' : ''}${modifier}`);
  }
  return parts.join(', ');
}

function skillsText(node: XmlNode): string {
  const parts: string[] = [];
  for (const sk of node.children.filter((c) => lower(c.name) === 'skill')) {
    const id = Number.parseInt(text(sk, 'id') ?? '', 10);
    const modifier = Number.parseInt(text(sk, 'modifier') ?? '', 10);
    const name = GM_SKILLS[id];
    if (!name || !Number.isFinite(modifier)) continue;
    parts.push(`${name} ${modifier >= 0 ? '+' : ''}${modifier}`);
  }
  return parts.join(', ');
}

/** `<attack><name/><atk/><dmg/></attack>` → `name|+atk|dmg`; a plain-text triple passes through. */
function attackTriple(attack: XmlNode, actionName: string): string {
  if (attack.children.length === 0) return attack.text.trim();
  const name = text(attack, 'name') || actionName;
  const atk = text(attack, 'atk');
  const dmg = text(attack, 'dmg') ?? '';
  const toHit = atk ? (atk.startsWith('+') || atk.startsWith('-') ? atk : `+${atk}`) : '';
  return `${name}|${toHit}|${dmg}`;
}

function convertFeature(feature: XmlNode): XmlNode {
  const actionName = text(feature, 'name') ?? '';
  return {
    ...feature,
    children: feature.children.map((c) =>
      lower(c.name) === 'attack' ? leaf('attack', attackTriple(c, actionName)) : c,
    ),
  };
}

const PASS_THROUGH = new Set([
  'type',
  'alignment',
  'speed',
  'resist',
  'vulnerable',
  'immune',
  'conditionimmune',
  'senses',
  'passive',
  'languages',
  'description',
]);
const FEATURE = new Set(['trait', 'action', 'reaction', 'legendary']);

/**
 * Rewrites a Game Master PC/NPC/monster node into compendium `<monster>` shape. `<label>` is kept
 * as a child so callers can read the table label; the record name is `<name>`.
 */
export function gmToCompendiumMonster(node: XmlNode): XmlNode {
  const out: XmlNode = { name: 'monster', attrs: {}, text: '', children: [] };
  const push = (n: XmlNode | undefined) => n && out.children.push(n);
  const name = text(node, 'name') || text(node, 'label') || '';
  push(leaf('name', name));

  const size = text(node, 'size');
  if (size !== undefined) {
    const idx = Number.parseInt(size, 10);
    push(leaf('size', Number.isFinite(idx) ? (GM_SIZES[idx] ?? size) : size));
  } else {
    push(leaf('size', 'M'));
  }

  // Like <cr>, <ac> is omitted at its default (a sheep with AC 10 had none).
  const ac = text(node, 'ac') ?? '10';
  const armor = text(node, 'armor');
  push(leaf('ac', armor ? `${ac} (${armor})` : ac));
  const hp = text(node, 'hpMax') ?? text(node, 'hp');
  const hd = text(node, 'hd');
  if (hp) push(leaf('hp', hd ? `${hp} (${hd})` : hp));

  for (const c of node.children) {
    const n = lower(c.name);
    if (PASS_THROUGH.has(n)) push(c);
  }
  for (const l of abilityLeaves(node)) push(l);
  for (const tag of ABILITY_TAGS) {
    // Compendium-shaped ability leaves (str, dex…) on the same node win over the csv.
    const direct = text(node, tag);
    if (direct !== undefined && !text(node, 'abilities')) push(leaf(tag, direct));
  }
  const saves = savesText(node);
  if (saves) push(leaf('save', saves));
  const skills = skillsText(node);
  if (skills) push(leaf('skill', skills));
  // Game Master omits <cr> at its default; every observed CR 1 creature lacked the element.
  const cr = gmCrToString(text(node, 'cr')) ?? '1';
  push(leaf('cr', cr));
  const init = text(node, 'init');
  if (init) push(leaf('init', init));

  let source: string | undefined;
  for (const c of node.children) {
    const n = lower(c.name);
    if (!FEATURE.has(n)) continue;
    if (n === 'trait' && lower(text(c, 'name') ?? '') === 'source') {
      source = (text(c, 'text') ?? '').split(/\r?\n/)[0]?.trim();
      continue;
    }
    push(convertFeature(c));
  }
  const description = text(node, 'description');
  const descriptionText = [description ?? '', source ? `Source: ${source}` : '']
    .filter(Boolean)
    .join('\n\n');
  if (descriptionText && !description) push(leaf('description', descriptionText));
  else if (source && description) {
    out.children = out.children.filter((c) => c.name !== 'description');
    push(leaf('description', descriptionText));
  }

  const spellNames = node.children
    .filter((c) => lower(c.name) === 'spell')
    .map((s) => text(s, 'name') ?? '')
    .filter(Boolean);
  if (spellNames.length > 0) push(leaf('spells', spellNames.join(', ')));
  const slots = text(node, 'slots');
  if (slots) push(leaf('slots', slots.replace(/,\s*$/, '')));

  const label = text(node, 'label');
  if (label) push(leaf('label', label));
  return out;
}

/** Rewrites a Game Master `<spell>` (numeric school, v/s/m flags, `<sclass>` list) into compendium shape. */
export function gmToCompendiumSpell(node: XmlNode): XmlNode {
  const out: XmlNode = { name: 'spell', attrs: {}, text: '', children: [] };
  const push = (n: XmlNode) => out.children.push(n);
  push(leaf('name', text(node, 'name') ?? ''));
  push(leaf('level', text(node, 'level') ?? '0'));
  const school = text(node, 'school');
  const idx = school === undefined ? Number.NaN : Number.parseInt(school, 10);
  push(leaf('school', Number.isFinite(idx) ? (GM_SCHOOLS[idx] ?? '') : (school ?? '')));
  if (text(node, 'ritual')) push(leaf('ritual', text(node, 'ritual') === '1' ? 'YES' : 'NO'));
  for (const n of ['time', 'range', 'duration']) {
    const v = text(node, n);
    if (v !== undefined) push(leaf(n, v));
  }
  const components: string[] = [];
  if (text(node, 'v') === '1') components.push('V');
  if (text(node, 's') === '1') components.push('S');
  if (text(node, 'm') === '1') {
    const materials = text(node, 'materials');
    components.push(materials ? `M (${materials})` : 'M');
  }
  const existing = text(node, 'components');
  push(leaf('components', existing ?? components.join(', ')));
  const classes = node.children
    .filter((c) => lower(c.name) === 'sclass')
    .map((c) => c.text.trim())
    .filter(Boolean);
  const classesText = text(node, 'classes');
  if (classes.length || classesText) push(leaf('classes', classesText ?? classes.join(', ')));
  for (const c of node.children) {
    const n = lower(c.name);
    if (n === 'text' || n === 'roll' || n === 'modifier') push(c);
  }
  return out;
}

/** Splits Game Master's `<name>` for a PC ("Dwarf, Hill Cleric 5") into class text and level. */
export function splitClassLevel(value: string): { classText: string; level?: number } {
  const m = /^(.*?)\s*(\d{1,2})\s*$/.exec(value.trim());
  if (m?.[1] && m[2])
    return { classText: m[1].trim(), level: Math.min(20, Math.max(1, Number(m[2]))) };
  return { classText: value.trim() };
}
