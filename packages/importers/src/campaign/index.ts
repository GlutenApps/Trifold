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
import { normalizeMonster } from '../compendium/monster';
import type { NormalizeContext } from '../compendium/context';
import { createRecordStream } from '../xml/recordStream';
import { children, textBlocks, type XmlNode } from '../xml/tree';

/**
 * Lion's Den campaign XML (DATA-FORMATS.md §3): `<campaign version="5">` with name, adventures,
 * PCs, NPCs, notes, encounters and items. The exact child names of encounters and adventures are
 * marked (verify) in the design, so this parser accepts every plausible shape, matches element
 * names case-insensitively, and reports what it did not understand. A Fight Club "GM export" is
 * the same document with a single `<pc>`.
 */

export interface ImportedPc {
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
  name: string;
  role: string;
  location: string;
  notes: string;
  isAlive: boolean;
  /** Key of an inline stat block emitted into `statBlocks`. */
  statBlockKey?: string;
}

export interface ImportedNote {
  title: string;
  body: string;
}

export interface ImportedCombatant {
  name: string;
  label?: string;
  quantity: number;
  role: 'ally' | 'enemy' | 'neutral';
  hp?: number;
  maxHp?: number;
  hidden: boolean;
  /** The element said so (`<pc>`), or a role of "pc"/"player". Main also matches PC names. */
  isPc: boolean;
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
  /** Inline stat blocks (NPC or monster elements with stat fields), as monster records. */
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
    const blocks = textBlocks(
      node,
      node.children.find((c) => lower(c.name) === lower(name))?.name ?? name,
    );
    if (blocks) out.push(blocks);
  }
  return out.join('\n\n');
}

/** A `<pc>`, `<npc>` or `<monster>` carrying stat-block fields. */
function hasStatBlock(node: XmlNode): boolean {
  const names = new Set(node.children.map((c) => lower(c.name)));
  return ['ac', 'hp'].every((n) => names.has(n)) && ['str', 'dex', 'con'].some((n) => names.has(n));
}

function roleOf(value: string | undefined, elementName: string): ImportedCombatant['role'] {
  const v = (value ?? '').toLowerCase();
  if (/^(ally|allies|friend|friendly|pc|player)/.test(v) || elementName === 'pc') return 'ally';
  if (/^(neutral|bystander)/.test(v)) return 'neutral';
  return 'enemy';
}

function importPc(node: XmlNode): ImportedPc {
  const name = firstText(node, 'name') ?? 'Unnamed PC';
  const pc: ImportedPc = {
    name,
    saves: parseSaves(firstText(node, 'save', 'saves')),
    notes: paragraphs(node, 'text', 'description'),
  };
  const player = firstText(node, 'player', 'playername');
  if (player) pc.playerName = player;
  const cls = firstText(node, 'class', 'classes');
  if (cls) pc.classText = cls.replace(/\s*\d+\s*$/, '').trim();
  const level =
    parseIntOrUndefined(firstText(node, 'level')) ??
    parseIntOrUndefined(/\b(\d{1,2})\s*$/.exec(cls ?? '')?.[1]);
  if (level !== undefined) pc.level = Math.min(20, Math.max(1, level));
  const hp = parseHp(firstText(node, 'hp', 'maxhp'));
  if (hp) pc.maxHp = hp.average;
  const ac = parseAc(firstText(node, 'ac'));
  if (ac) pc.ac = ac.value;
  const init = parseIntOrUndefined(firstText(node, 'init', 'initiative'));
  const dex = parseIntOrUndefined(firstText(node, 'dex'));
  if (init !== undefined) pc.initiativeBonus = init;
  else if (dex !== undefined) pc.initiativeBonus = abilityModifier(dex);
  const speed = parseSpeed(firstText(node, 'speed'));
  if (speed.walk !== undefined) pc.speed = speed.walk;
  const passive = parseIntOrUndefined(firstText(node, 'passive', 'passiveperception'));
  if (passive !== undefined) pc.passivePerception = passive;
  const dc = parseIntOrUndefined(firstText(node, 'spelldc', 'savedc', 'spellsavedc'));
  if (dc !== undefined) pc.spellSaveDc = dc;
  return pc;
}

function importNote(node: XmlNode): ImportedNote {
  return {
    title: firstText(node, 'name', 'title') ?? 'Untitled note',
    body: paragraphs(node, 'text', 'description', 'body'),
  };
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
const ENCOUNTER_META = new Set(['name', 'text', 'description', 'notes', 'note']);

export function createCampaignParser(options: CampaignImportOptions) {
  const warnings: string[] = [];
  const statBlocks: CompendiumRecord[] = [];
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

  const statBlockFrom = (node: XmlNode, label: string): string | undefined => {
    const ctx: NormalizeContext = {
      sourceId: options.statBlockSourceId,
      defaultEdition: options.defaultEdition,
      edition2024Books: options.edition2024Books ?? [],
      newId,
      warn: (m) => warnings.push(`${label}: ${m}`),
    };
    const record = normalizeMonster(node, ctx);
    if (!record) return undefined;
    const parsed = CompendiumRecord.safeParse(record);
    if (!parsed.success) {
      warnings.push(
        `${label}: inline stat block skipped (${parsed.error.issues[0]?.message ?? 'invalid'})`,
      );
      return undefined;
    }
    statBlocks.push(parsed.data);
    return parsed.data.key;
  };

  const importEncounter = (node: XmlNode): ImportedEncounter => {
    const name = firstText(node, 'name') ?? 'Unnamed encounter';
    const encounter: ImportedEncounter = {
      name,
      notes: paragraphs(node, 'text', 'description', 'notes'),
      combatants: [],
    };
    for (const child of node.children) {
      const kind = lower(child.name);
      if (ENCOUNTER_META.has(kind)) continue;
      if (!COMBATANT_ELEMENTS.has(kind)) {
        warnings.push(`encounter "${name}": unknown element <${child.name}> ignored`);
        continue;
      }
      const cname =
        firstText(child, 'name') ?? (child.children.length === 0 ? child.text.trim() : '');
      if (!cname) {
        warnings.push(`encounter "${name}": <${child.name}> without a name ignored`);
        continue;
      }
      const combatant: ImportedCombatant = {
        name: cname,
        quantity: Math.max(
          1,
          parseIntOrUndefined(firstText(child, 'count', 'quantity', 'qty', 'number')) ?? 1,
        ),
        role: roleOf(firstText(child, 'role', 'side', 'faction'), kind),
        hidden: parseYesNo(firstText(child, 'hidden')),
        isPc: kind === 'pc' || /^(pc|player)$/i.test(firstText(child, 'role') ?? ''),
      };
      const label = firstText(child, 'label', 'alias', 'nickname');
      if (label) combatant.label = label;
      const hp = parseIntOrUndefined(firstText(child, 'hp', 'currenthp'));
      const maxHp = parseIntOrUndefined(firstText(child, 'maxhp', 'hpmax'));
      if (hp !== undefined) combatant.hp = hp;
      if (maxHp !== undefined) combatant.maxHp = maxHp;
      if (hasStatBlock(child) && kind !== 'pc') {
        const key = statBlockFrom(child, `encounter "${name}" / ${cname}`);
        if (key) combatant.statBlockKey = key;
      }
      encounter.combatants.push(combatant);
    }
    return encounter;
  };

  const importAdventure = (node: XmlNode): ImportedAdventure => {
    const adventure: ImportedAdventure = {
      name: firstText(node, 'name') ?? 'Unnamed adventure',
      summary: paragraphs(node, 'text', 'description', 'summary'),
      notes: childrenNamed(node, 'note').map(importNote),
      encounters: childrenNamed(node, 'encounter').map(importEncounter),
    };
    for (const child of node.children) {
      const kind = lower(child.name);
      if (['name', 'text', 'description', 'summary', 'note', 'encounter'].includes(kind)) continue;
      if (kind === 'pc') result.pcs.push(importPc(child));
      else if (kind === 'npc') result.npcs.push(importNpc(child));
      else if (kind === 'item') result.items.push(importItem(child));
      else warnings.push(`adventure "${adventure.name}": unknown element <${child.name}> ignored`);
    }
    return adventure;
  };

  const importNpc = (node: XmlNode): ImportedNpc => {
    const name = firstText(node, 'name') ?? 'Unnamed NPC';
    const npc: ImportedNpc = {
      name,
      role: firstText(node, 'role', 'occupation', 'title') ?? '',
      location: firstText(node, 'location', 'place') ?? '',
      notes: paragraphs(node, 'text', 'description', 'notes'),
      isAlive: !parseYesNo(firstText(node, 'dead')),
    };
    if (hasStatBlock(node)) {
      const key = statBlockFrom(node, `npc "${name}"`);
      if (key) npc.statBlockKey = key;
    }
    return npc;
  };

  const stream = createRecordStream({
    onRoot: (name) => {
      result.rootElement = name;
      if (lower(name) !== 'campaign')
        warnings.push(`root element is <${name}>, expected <campaign>`);
    },
    onRecord: (node) => {
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
        case 'note':
          result.notes.push(importNote(node));
          break;
        case 'encounter':
          result.encounters.push(importEncounter(node));
          break;
        case 'item':
          result.items.push(importItem(node));
          break;
        case 'text':
        case 'description':
          result.notes.push({ title: 'Campaign description', body: node.text.trim() });
          break;
        default:
          warnings.push(`unknown element <${node.name}> ignored`);
      }
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

// Re-exported so callers can build combatant matches without importing the compendium parser.
export { children };
