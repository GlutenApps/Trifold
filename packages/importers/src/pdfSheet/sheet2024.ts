import type { PdfField } from './readPdfSheet';

const fieldKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The official 2024 character sheet (ADR 0073; DATA-FORMATS.md §5.8). Its fields have generic
 * names (`Text64`, `Check Box37`), the same in every copy, so they are translated into the names
 * the reader already knows. The table was worked out from a copy filled with each field's own
 * name and checked against a filled sheet's printed page (fixtures/local/pdf-sheets).
 */

/** Fields only this sheet has, together: its first spell row's name and concentration box. */
export function isSheet2024(keys: ReadonlySet<string>): boolean {
  return keys.has('text1') && keys.has('text106.0') && keys.has('check box252.0');
}

const RENAME: Record<string, string> = {
  text1: 'CharacterName',
  text6: 'Background',
  text8: 'Race',
  text13: 'AC',
  text16: 'HPMax',
  text19: 'ProfBonus',
  text26: 'Initiative',
  text27: 'Speed',
  text28: 'Size',
  text29: 'Passive',
  // Scores in the small box, modifiers in the circle.
  text64: 'STR',
  text21: 'STRmod',
  text66: 'DEX',
  text22: 'DEXmod',
  text67: 'CON',
  text24: 'CONmod',
  text63: 'INT',
  text20: 'INTmod',
  text65: 'WIS',
  text23: 'WISmod',
  text68: 'CHA',
  text25: 'CHAmod',
  text91: 'ST Strength',
  text87: 'ST Dexterity',
  text86: 'ST Constitution',
  text69: 'ST Intelligence',
  text75: 'ST Wisdom',
  text81: 'ST Charisma',
  'check box37': 'StrProf',
  'check box33': 'DexProf',
  'check box32': 'ConProf',
  'check box4': 'IntProf',
  'check box21': 'WisProf',
  'check box26': 'ChaProf',
  text92: 'Athletics',
  text88: 'Acrobatics',
  text89: 'SleightofHand',
  text90: 'Stealth',
  text70: 'Arcana',
  text71: 'History',
  text72: 'Investigation',
  text73: 'Nature',
  text74: 'Religion',
  text76: 'Animal',
  text77: 'Insight',
  text78: 'Medicine',
  text79: 'Perception',
  text80: 'Survival',
  text82: 'Deception',
  text83: 'Intimidation',
  text84: 'Performance',
  text85: 'Persuasion',
  'check box38': 'AthleticsProf',
  'check box34': 'AcrobaticsProf',
  'check box35': 'SleightofHandProf',
  'check box36': 'StealthProf',
  'check box16': 'ArcanaProf',
  'check box17': 'HistoryProf',
  'check box19': 'InvestigationProf',
  'check box20': 'NatureProf',
  'check box18': 'ReligionProf',
  'check box22': 'AnimalProf',
  'check box23': 'InsightProf',
  'check box25': 'MedicineProf',
  'check box31': 'PerceptionProf',
  'check box24': 'SurvivalProf',
  'check box27': 'DeceptionProf',
  'check box28': 'IntimidationProf',
  'check box30': 'PerformanceProf',
  'check box29': 'PersuasionProf',
  // Six weapon rows: name, attack bonus or save DC, damage (the fourth, notes, is not kept).
  text30: 'Wpn Name',
  text31: 'Wpn1 AtkBonus',
  text32: 'Wpn1 Damage',
  text34: 'Wpn Name 2',
  text35: 'Wpn2 AtkBonus',
  text36: 'Wpn2 Damage',
  text38: 'Wpn Name 3',
  text39: 'Wpn3 AtkBonus',
  text40: 'Wpn3 Damage',
  text42: 'Wpn Name 4',
  text43: 'Wpn4 AtkBonus',
  text44: 'Wpn4 Damage',
  text46: 'Wpn Name 5',
  text47: 'Wpn5 AtkBonus',
  text48: 'Wpn5 Damage',
  text50: 'Wpn Name 6',
  text51: 'Wpn6 AtkBonus',
  text52: 'Wpn6 Damage',
  text111: 'SpellcastingAbility',
  text94: 'SpellSaveDC',
  text95: 'SpellAtkBonus',
  // Slot totals, as the 2014 sheet numbers them (19 is 1st level); the 2024 numbers jump.
  text112: 'SlotsTotal 19',
  text113: 'SlotsTotal 20',
  text114: 'SlotsTotal 21',
  text117: 'SlotsTotal 22',
  text116: 'SlotsTotal 23',
  text115: 'SlotsTotal 24',
  text118: 'SlotsTotal 25',
  text119: 'SlotsTotal 26',
  text120: 'SlotsTotal 27',
  text54: 'Class Features 1',
  text55: 'Class Features 2',
  text57: 'Species Traits',
  text58: 'Feats',
  text96: 'Appearance',
  text97: 'Backstory',
  text100: 'Alignment',
  text226: 'CP',
  text267: 'SP',
  text268: 'EP',
  text269: 'GP',
  text270: 'PP',
};

/** The sheet's fields under the names the reader knows, with the joined-up ones added. */
export function fromSheet2024(fields: readonly PdfField[]): PdfField[] {
  const byKey = new Map(fields.map((f) => [fieldKey(f.name), f]));
  const value = (k: string) => byKey.get(k)?.value.trim() ?? '';
  const checked = (k: string) => byKey.get(k)?.checked ?? false;
  const made = (name: string, text: string): PdfField => ({
    page: 1,
    name,
    kind: 'text',
    value: text,
    checked: false,
    rect: [0, 0, 0, 0],
  });

  const out: PdfField[] = [];
  for (const f of fields) {
    const key = fieldKey(f.name);
    const spell = /^text10([56])\.(\d+)$/.exec(key);
    if (spell) {
      // Text105.n is a spell row's level, Text106.n its name.
      out.push({ ...f, name: `spell ${spell[1] === '5' ? 'level' : 'name'} ${spell[2]}` });
      continue;
    }
    const to = RENAME[key];
    if (to) out.push({ ...f, name: to });
  }

  // "Cleric", level 5, "Life Domain" → "Cleric 5 (Life Domain)"; a class box with levels in it
  // ("Fighter 3 / Rogue 2") is taken as it is.
  const cls = value('text7');
  const level = value('text11');
  const sub = value('text9');
  if (cls) {
    out.push(
      made(
        'ClassLevel',
        /\d/.test(cls) ? cls : `${cls}${level ? ` ${level}` : ''}${sub ? ` (${sub})` : ''}`,
      ),
    );
  }

  const armor = (
    [
      ['check box13', 'Light'],
      ['check box14', 'Medium'],
      ['check box15', 'Heavy'],
      ['check box12', 'Shields'],
    ] as const
  )
    .filter(([k]) => checked(k))
    .map(([, label]) => label);
  const training = [
    armor.length ? `Armor: ${armor.join(', ')}` : '',
    value('text59') ? `Weapons: ${value('text59')}` : '',
    value('text60') ? `Tools: ${value('text60')}` : '',
    value('text98') ? `Languages: ${value('text98')}` : '',
  ].filter(Boolean);
  if (training.length) out.push(made('ProficienciesLang', training.join('\n')));

  // Attuned magic items join the equipment list.
  const attuned = ['text101', 'text102', 'text103'].map(value).filter(Boolean);
  const equipment = [value('text99'), ...attuned].filter(Boolean).join('\n');
  if (equipment) out.push(made('Equipment', equipment));
  return out;
}
