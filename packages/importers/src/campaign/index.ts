import { ulid } from 'ulid';
import {
  abilityModifier,
  normalizeKey,
  parseAc,
  parseHp,
  parseIntOrUndefined,
  parseSaves,
  parseSpeed,
  parseYesNo,
} from '@trifold/rules';
import { CompendiumRecord, type Edition } from '@trifold/schema';
import type { NormalizeContext } from '../compendium/context';
import { normalizeMonster } from '../compendium/monster';
import { normalizeSpell } from '../compendium/others';
import { createRecordStream } from '../xml/recordStream';
import { textBlocks, type XmlNode } from '../xml/tree';
import {
  gmToCompendiumMonster,
  gmToCompendiumSpell,
  isGmNative,
  splitClassLevel,
} from './gmNative';

/**
 * Lion's Den campaign XML (DATA-FORMATS.md §3). Verified against a Game Master 5e export:
 * `<data version="5">` wraps one `<campaign>` holding `<name>`, `<pc>`, `<npc>`, `<encounter>`,
 * `<item>` and `<note>`. Encounter combatants reference PCs/NPCs by `<uid>` or carry an inline
 * `<monster>`. Earlier guesses (a bare `<campaign>` root, `<adventure>` groups, plain
 * `<combatant>` name entries) stay supported. A Fight Club "GM export" is a campaign with one PC.
 */

export interface ImportedPc {
  uid?: string;
  name: string;
  playerName?: string;
  classText?: string;
  level?: number;
  maxHp?: number;
  ac?: number;
  initiativeBonus?: number;
  speed?: number;
  passivePerception?: number;
  saves: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>;
  spellSaveDc?: number;
  notes: string;
}

export interface ImportedNpc {
  uid?: string;
  name: string;
  role: string;
  location: string;
  notes: string;
  isAlive: boolean;
  isEnemy: boolean;
  /** Key of an inline stat block emitted into `statBlocks`. */
  statBlockKey?: string;
}

export interface ImportedNote {
  title: string;
  body: string;
}

export interface ImportedCombatant {
  /** Display name; for inline monsters the record name, for uid references `#<uid>`. */
  name: string;
  label?: string;
  quantity: number;
  role: 'ally' | 'enemy' | 'neutral';
  hp?: number;
  maxHp?: number;
  hidden: boolean;
  /** The element said so (`<pc>`), or a role of "pc"/"player". Main also matches PC names. */
  isPc: boolean;
  /** Reference to a PC or NPC by Game Master uid. */
  uid?: string;
  statBlockKey?: string;
}

export interface ImportedEncounter {
  name: string;
  notes: string;
  combatants: ImportedCombatant[];
}

export interface ImportedAdventure {
  name: string;
  summary: string;
  notes: ImportedNote[];
  encounters: ImportedEncounter[];
}

export interface ImportedItem {
  name: string;
  quantity: number;
  text: string;
}

export interface CampaignImport {
  name: string | null;
  pcs: ImportedPc[];
  npcs: ImportedNpc[];
  notes: ImportedNote[];
  adventures: ImportedAdventure[];
  encounters: ImportedEncounter[];
  items: ImportedItem[];
  /** Inline stat blocks and nested spells, as compendium records (deduplicated by kind and key). */
  statBlocks: CompendiumRecord[];
  warnings: string[];
  rootElement: string | null;
}

export interface CampaignImportOptions {
  /** Source id given to inline stat blocks. */
  statBlockSourceId: string;
  defaultEdition: Edition;
  edition2024Books?: readonly string[];
  newId?: () => string;
}

const lower = (s: string) => s.toLowerCase();

function childrenNamed(node: XmlNode, ...names: string[]): XmlNode[] {
  const set = new Set(names.map(lower));
  return node.children.filter((c) => set.has(lower(c.name)));
}

function firstText(node: XmlNode, ...names: string[]): string | undefined {
  for (const name of names) {
    const hit = node.children.find((c) => lower(c.name) === lower(name));
    if (hit) return hit.text.trim();
    const attr = node.attrs[name];
    if (attr !== undefined) return attr.trim();
  }
  return undefined;
}

function paragraphs(node: XmlNode, ...names: string[]): string {
  const out: string[] = [];
  for (const name of names) {
    const actual = node.children.find((c) => lower(c.name) === lower(name))?.name;
    if (!actual) continue;
    const blocks = textBlocks(node, actual);
    if (blocks) out.push(blocks);
  }
  return out.join('\n\n');
}

/** A node carrying stat-block fields, in either the compendium or the Game Master shape. */
function hasStatBlock(node: XmlNode): boolean {
  if (isGmNative(node)) return true;
  const names = new Set(node.children.map((c) => lower(c.name)));
  return ['ac', 'hp'].every((n) => names.has(n)) && ['str', 'dex', 'con'].some((n) => names.has(n));
}

function isEnemyFlag(value: string | undefined): boolean {
  return value === '1' || parseYesNo(value);
}

function roleOf(
  value: string | undefined,
  elementName: string,
  enemyFlag: string | undefined,
): ImportedCombatant['role'] {
  const v = (value ?? '').toLowerCase();
  if (elementName === 'pc' || /^(ally|allies|friend|friendly|pc|player)/.test(v)) return 'ally';
  if (/^(neutral|bystander)/.test(v)) return 'neutral';
  if (v === '' && enemyFlag !== undefined) return isEnemyFlag(enemyFlag) ? 'enemy' : 'ally';
  return 'enemy';
}

function importPc(node: XmlNode): ImportedPc {
  const gm = isGmNative(node);
  const stats = gm ? gmToCompendiumMonster(node) : node;
  const label = firstText(node, 'label');
  const rawName = firstText(node, 'name') ?? '';
  const name = (gm ? label || rawName : rawName) || 'Unnamed PC';
  const pc: ImportedPc = {
    name,
    saves: parseSaves(firstText(stats, 'save', 'saves')),
    notes: paragraphs(node, 'text', 'description'),
  };
  const uid = firstText(node, 'uid');
  if (uid) pc.uid = uid;
  const player = firstText(node, 'player', 'playername');
  if (player) pc.playerName = player;
  const cls = firstText(node, 'class', 'classes') ?? (gm && label ? rawName : undefined);
  if (cls) {
    const split = splitClassLevel(cls);
    if (split.classText) pc.classText = split.classText;
    if (split.level !== undefined) pc.level = split.level;
  }
  const level = parseIntOrUndefined(firstText(node, 'level'));
  if (level !== undefined) pc.level = Math.min(20, Math.max(1, level));
  const hp = parseHp(firstText(stats, 'hp'));
  if (hp) pc.maxHp = hp.average;
  const ac = parseAc(firstText(stats, 'ac'));
  if (ac) pc.ac = ac.value;
  const init = parseIntOrUndefined(firstText(stats, 'init', 'initiative'));
  const dex = parseIntOrUndefined(firstText(stats, 'dex'));
  if (init !== undefined) pc.initiativeBonus = init;
  else if (dex !== undefined) pc.initiativeBonus = abilityModifier(dex);
  const speed = parseSpeed(firstText(stats, 'speed'));
  if (speed.walk !== undefined) pc.speed = speed.walk;
  const passive = parseIntOrUndefined(firstText(stats, 'passive', 'passiveperception'));
  if (passive !== undefined) pc.passivePerception = passive;
  const dc = parseIntOrUndefined(firstText(node, 'spelldc', 'savedc', 'spellsavedc'));
  if (dc !== undefined) pc.spellSaveDc = dc;
  return pc;
}

function importNote(node: XmlNode): ImportedNote | null {
  const title = firstText(node, 'name', 'title');
  const body = paragraphs(node, 'text', 'description', 'body');
  if (!title && !body) return null;
  return { title: title || 'Untitled note', body };
}

function importItem(node: XmlNode): ImportedItem {
  return {
    name: firstText(node, 'name') ?? 'Unnamed item',
    quantity: parseIntOrUndefined(firstText(node, 'quantity', 'count', 'qty')) ?? 1,
    text: paragraphs(node, 'text', 'description'),
  };
}

const COMBATANT_ELEMENTS = new Set([
  'combatant',
  'monster',
  'creature',
  'pc',
  'npc',
  'entry',
  'member',
  'participant',
]);
const ENCOUNTER_META = new Set([
  'name',
  'text',
  'description',
  'notes',
  'state',
  'current',
  'round',
  'uid',
]);

export function createCampaignParser(options: CampaignImportOptions) {
  const warnings: string[] = [];
  const statBlocks: CompendiumRecord[] = [];
  const seenKeys = new Set<string>();
  const newId = options.newId ?? ulid;
  const result: CampaignImport = {
    name: null,
    pcs: [],
    npcs: [],
    notes: [],
    adventures: [],
    encounters: [],
    items: [],
    statBlocks,
    warnings,
    rootElement: null,
  };

  const ctxFor = (label: string): NormalizeContext => ({
    sourceId: options.statBlockSourceId,
    defaultEdition: options.defaultEdition,
    edition2024Books: options.edition2024Books ?? [],
    newId,
    warn: (m) => warnings.push(`${label}: ${m}`),
  });

  const emit = (record: CompendiumRecord | null, label: string): string | undefined => {
    if (!record) return undefined;
    const parsed = CompendiumRecord.safeParse(record);
    if (!parsed.success) {
      warnings.push(
        `${label}: inline record skipped (${parsed.error.issues[0]?.message ?? 'invalid'})`,
      );
      return undefined;
    }
    const dedupe = `${parsed.data.kind}:${parsed.data.key}`;
    if (!seenKeys.has(dedupe)) {
      seenKeys.add(dedupe);
      statBlocks.push(parsed.data);
    }
    return parsed.data.key;
  };

  /** Normalizes an inline stat block (either shape) plus nested spells; returns the monster key. */
  const statBlockFrom = (node: XmlNode, label: string): string | undefined => {
    const gm = isGmNative(node);
    const monsterNode = gm ? gmToCompendiumMonster(node) : node;
    for (const spell of childrenNamed(node, 'spell')) {
      const native = gm || childrenNamed(spell, 'sclass').length > 0;
      const spellNode = native ? gmToCompendiumSpell(spell) : spell;
      emit(normalizeSpell(spellNode, ctxFor(`${label} / spell`)), `${label} / spell`);
    }
    return emit(normalizeMonster(monsterNode, ctxFor(label)), label);
  };

  const importCombatant = (child: XmlNode, encounterName: string): ImportedCombatant | null => {
    const kind = lower(child.name);
    // Game Master wraps each entry: <combatant><monster>…</monster></combatant>.
    const inner =
      kind === 'combatant' && child.children.length === 1 && child.children[0]
        ? child.children[0]
        : child;
    const innerKind = lower(inner.name);
    const uid = firstText(inner, 'uid');
    const label = firstText(inner, 'label', 'alias', 'nickname');
    const cname =
      firstText(inner, 'name') ?? label ?? (inner.children.length === 0 ? inner.text.trim() : '');
    if (!cname && !uid) {
      warnings.push(`encounter "${encounterName}": <${child.name}> without a name or uid ignored`);
      return null;
    }
    const combatant: ImportedCombatant = {
      name: cname || `#${uid}`,
      quantity: Math.max(
        1,
        parseIntOrUndefined(firstText(inner, 'count', 'quantity', 'qty', 'number')) ?? 1,
      ),
      role: roleOf(
        firstText(inner, 'role', 'side', 'faction'),
        innerKind,
        firstText(inner, 'enemy'),
      ),
      hidden: parseYesNo(firstText(inner, 'hidden')),
      isPc: innerKind === 'pc' || /^(pc|player)$/i.test(firstText(inner, 'role') ?? ''),
    };
    if (uid) combatant.uid = uid;
    if (label && label !== cname) combatant.label = label;
    const hp = parseIntOrUndefined(firstText(inner, 'hpCurrent', 'hp', 'currenthp'));
    const maxHp = parseIntOrUndefined(firstText(inner, 'hpMax', 'maxhp', 'hpmax'));
    if (hp !== undefined) combatant.hp = hp;
    if (maxHp !== undefined) combatant.maxHp = maxHp;
    if (hasStatBlock(inner) && innerKind !== 'pc') {
      const key = statBlockFrom(inner, `encounter "${encounterName}" / ${cname}`);
      if (key) combatant.statBlockKey = key;
    }
    return combatant;
  };

  const importEncounter = (node: XmlNode): ImportedEncounter => {
    const name = firstText(node, 'name') ?? 'Unnamed encounter';
    const noteBodies = childrenNamed(node, 'note')
      .map(importNote)
      .filter((n): n is ImportedNote => n !== null)
      .map((n) => `${n.title}: ${n.body}`);
    const encounter: ImportedEncounter = {
      name,
      notes: [paragraphs(node, 'text', 'description', 'notes'), ...noteBodies]
        .filter(Boolean)
        .join('\n\n'),
      combatants: [],
    };
    for (const child of node.children) {
      const kind = lower(child.name);
      if (ENCOUNTER_META.has(kind) || kind === 'note') continue;
      if (!COMBATANT_ELEMENTS.has(kind)) {
        warnings.push(`encounter "${name}": unknown element <${child.name}> ignored`);
        continue;
      }
      const combatant = importCombatant(child, name);
      if (combatant) encounter.combatants.push(combatant);
    }
    return encounter;
  };

  const importNpc = (node: XmlNode): ImportedNpc => {
    const label = firstText(node, 'label');
    const rawName = firstText(node, 'name');
    const name = label || rawName || 'Unnamed NPC';
    const npc: ImportedNpc = {
      name,
      role: firstText(node, 'role', 'occupation', 'title') ?? '',
      location: firstText(node, 'location', 'place') ?? '',
      notes: paragraphs(node, 'text', 'notes'),
      isAlive: !parseYesNo(firstText(node, 'dead')),
      isEnemy: isEnemyFlag(firstText(node, 'enemy')),
    };
    const uid = firstText(node, 'uid');
    if (uid) npc.uid = uid;
    if (hasStatBlock(node)) {
      const key = statBlockFrom(node, `npc "${name}"`);
      if (key) npc.statBlockKey = key;
    }
    return npc;
  };

  const importAdventure = (node: XmlNode): ImportedAdventure => {
    const adventure: ImportedAdventure = {
      name: firstText(node, 'name') ?? 'Unnamed adventure',
      summary: paragraphs(node, 'text', 'description', 'summary'),
      notes: childrenNamed(node, 'note')
        .map(importNote)
        .filter((n): n is ImportedNote => n !== null),
      encounters: childrenNamed(node, 'encounter').map(importEncounter),
    };
    for (const child of node.children) {
      const kind = lower(child.name);
      if (['name', 'text', 'description', 'summary', 'note', 'encounter', 'uid'].includes(kind)) {
        continue;
      }
      if (kind === 'pc') result.pcs.push(importPc(child));
      else if (kind === 'npc') result.npcs.push(importNpc(child));
      else if (kind === 'item') result.items.push(importItem(child));
      else warnings.push(`adventure "${adventure.name}": unknown element <${child.name}> ignored`);
    }
    return adventure;
  };

  const handle = (node: XmlNode) => {
    switch (lower(node.name)) {
      case 'name':
        result.name = node.text.trim() || null;
        break;
      case 'adventure':
        result.adventures.push(importAdventure(node));
        break;
      case 'pc':
        result.pcs.push(importPc(node));
        break;
      case 'npc':
        result.npcs.push(importNpc(node));
        break;
      case 'monster':
        statBlockFrom(node, `monster "${firstText(node, 'name') ?? '?'}"`);
        break;
      case 'note': {
        const note = importNote(node);
        if (note) result.notes.push(note);
        break;
      }
      case 'encounter':
        result.encounters.push(importEncounter(node));
        break;
      case 'item':
        result.items.push(importItem(node));
        break;
      case 'text':
      case 'description':
        if (node.text.trim()) {
          result.notes.push({ title: 'Campaign description', body: node.text.trim() });
        }
        break;
      case 'imagedata':
      case 'uid':
      case 'expanded':
        break;
      default:
        warnings.push(`unknown element <${node.name}> ignored`);
    }
  };

  const stream = createRecordStream({
    onRoot: (name) => {
      result.rootElement = name;
      if (!['campaign', 'data'].includes(lower(name))) {
        warnings.push(`root element is <${name}>, expected <data> or <campaign>`);
      }
    },
    onRecord: (node) => {
      // <data><campaign>…</campaign></data>: descend one level.
      if (lower(node.name) === 'campaign') node.children.forEach(handle);
      else handle(node);
    },
    onWarning: (m) => warnings.push(m),
  });

  return {
    write: (chunk: string) => stream.write(chunk),
    end: (): CampaignImport => {
      stream.end();
      return result;
    },
  };
}

export function parseCampaignXml(xml: string, options: CampaignImportOptions): CampaignImport {
  const parser = createCampaignParser(options);
  parser.write(xml);
  return parser.end();
}

/** Key used to match combatant and NPC names against records and PC cards. */
export function campaignKey(name: string): string {
  return normalizeKey(name);
}

export { GM_SCHOOLS, GM_SKILLS, gmCrToString } from './gmNative';
