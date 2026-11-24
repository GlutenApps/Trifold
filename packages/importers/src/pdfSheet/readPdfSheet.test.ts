import { describe, expect, it } from 'vitest';
import { deriveSheet } from '@trifold/rules';
import { readClasses, readPdfSheet, readScore, type PdfField } from './readPdfSheet';

/**
 * Import from PDF (ADR 0073; DATA-FORMATS.md §5.8). Fixtures are field lists as main reads them
 * from a PDF, written here with SRD-only content: a made-up character on each field set the
 * real sheets use, laid out where those sheets put their fields.
 */

let y = 700;
function text(name: string, value: string, rect?: PdfField['rect'], page = 1): PdfField {
  y -= 12;
  return { page, name, kind: 'text', value, checked: false, rect: rect ?? [300, y, 400, y + 10] };
}
function check(name: string, checked: boolean, rect: PdfField['rect'], page = 1): PdfField {
  return { page, name, kind: 'check', value: '', checked, rect };
}
function choice(name: string, value: string): PdfField {
  y -= 12;
  return { page: 1, name, kind: 'choice', value, checked: false, rect: [300, y, 400, y + 10] };
}
const row = (yy: number, x = 112): PdfField['rect'] => [x, yy, x + 14, yy + 8];
const box = (yy: number): PdfField['rect'] => [101, yy, 107, yy + 8];

function ok(fields: PdfField[]) {
  const result = readPdfSheet(fields);
  if (!result.ok) throw new Error(`expected a sheet, got ${result.problem}`);
  return result;
}

describe('readScore: score or modifier, by the value', () => {
  it('takes the plain number as the score whichever field holds it', () => {
    expect(readScore(['+3', '16'])).toEqual({ score: 16, modifier: 3 });
    expect(readScore(['17', '+3'])).toEqual({ score: 17, modifier: 3 });
    expect(readScore(['8', '-1'])).toEqual({ score: 8, modifier: -1 });
    expect(readScore(['8', '−1'])).toEqual({ score: 8, modifier: -1 });
  });
  it('tells two plain numbers apart by the modifier rule', () => {
    expect(readScore(['1', '12'])).toEqual({ score: 12, modifier: 1 });
    expect(readScore(['10', '0'])).toEqual({ score: 10, modifier: 0 });
  });
  it('reads a dropdown that carries both', () => {
    expect(readScore(['  14:    +2'])).toEqual({ score: 14, modifier: 2 });
    expect(readScore(['   8:    -1'])).toEqual({ score: 8, modifier: -1 });
  });
  it('leaves the score out when only a modifier is there', () => {
    expect(readScore(['+2'])).toEqual({ score: null, modifier: 2 });
  });
});

describe('readClasses', () => {
  it('reads one class, several, and a subclass before or after the level', () => {
    expect(readClasses('Fighter 5')).toEqual([{ name: 'Fighter', subclass: '', level: 5 }]);
    expect(readClasses('Wizard 3 / Cleric 2')).toEqual([
      { name: 'Wizard', subclass: '', level: 3 },
      { name: 'Cleric', subclass: '', level: 2 },
    ]);
    expect(readClasses('Cleric 2 (Life)')).toEqual([
      { name: 'Cleric', subclass: 'Life', level: 2 },
    ]);
    expect(readClasses('Fighter (Champion) 3')).toEqual([
      { name: 'Fighter', subclass: 'Champion', level: 3 },
    ]);
    expect(readClasses('Rogue LVL 4')).toEqual([{ name: 'Rogue', subclass: '', level: 4 }]);
  });
  it('gives nothing for a line without levels', () => {
    expect(readClasses('Fighter')).toEqual([]);
  });
});

describe('the official 2014 field set', () => {
  // The big box holds the modifier, as the printed sheet means (STR = "+3", STRmod = "16").
  const fighter = (): PdfField[] => [
    text('CharacterName', 'Tamsin Reed'),
    text('ClassLevel', 'Fighter 5'),
    text('Race ', 'Human'),
    text('Background', 'Soldier'),
    text('Alignment', 'Lawful Neutral'),
    text('STR', '+3'),
    text('STRmod', '16'),
    text('DEX', '+1'),
    text('DEXmod ', '12'),
    text('CON', '+2'),
    text('CONmod', '15'),
    text('INT', '+0'),
    text('INTmod', '10'),
    text('WIS', '+1'),
    text('WISmod', '13'),
    text('CHA', '-1'),
    text('CHamod', '8'),
    text('ProfBonus', '+3'),
    text('AC', '18'),
    text('Initiative', '+1'),
    text('Speed', '30 ft.'),
    text('HPMax', '49'),
    // Saves, each with its check box to the left on the same line.
    text('ST Strength', '+6', row(577)),
    check('Check Box 11', true, box(577)),
    text('ST Dexterity', '+1', row(563)),
    check('Check Box 18', false, box(563)),
    text('ST Constitution', '+5', row(550)),
    check('Check Box 19', true, box(550)),
    text('ST Intelligence', '+0', row(536)),
    text('ST Wisdom', '+1', row(523)),
    text('ST Charisma', '-1', row(509)),
    // Skills: Athletics proficient, Perception with expertise (only the number says so).
    text('Athletics', '+6', row(421)),
    check('Check Box 26', true, box(421)),
    text('Perception ', '+7', row(313)),
    check('Check Box 34', true, box(313)),
    text('Stealth', '+1', row(246)),
    text('Passive', '17'),
    text('Wpn Name', 'Longsword'),
    text('Wpn1 AtkBonus', '+6'),
    text('Wpn1 Damage ', '1d8+3 slashing'),
    text('Wpn Name 2', 'Heavy Crossbow'),
    text('Wpn2 AtkBonus ', '+4'),
    text('Wpn2 Damage ', '1d10+1 piercing'),
    text(
      'Equipment',
      "Chain mail, shield, longsword, 2 handaxes, explorer's pack (with rope, rations)",
    ),
    text('ProficienciesLang', 'All armor, shields; simple and martial weapons\nCommon, Dwarvish'),
    text('Features and Traits', 'Fighting Style: Defense\nSecond Wind\nAction Surge'),
    text('GP', '15'),
    text('SP', '7'),
    text('CP', '20'),
    text('PersonalityTraits', 'I face problems head-on.'),
    text('Flaws', 'I obey the law, even when it hurts.'),
  ];

  it('reads the character, with scores from the plain numbers', () => {
    const { imported, warnings } = ok(fighter());
    expect(imported.layout).toBe('sheet2014');
    expect(imported.edition).toBe('2014');
    expect(imported.name).toBe('Tamsin Reed');
    const s = imported.sheet;
    expect(s.classes).toEqual([{ name: 'Fighter', subclass: '', level: 5 }]);
    expect(s.species).toBe('Human');
    expect(s.background).toBe('Soldier');
    expect(s.abilities).toEqual({ str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 });
    expect(s.maxHp).toBe(49);
    expect(s.speed).toBe(30);
    expect(warnings).toEqual([]);
  });

  it('marks saves by the check box beside them, and expertise by the number', () => {
    const s = ok(fighter()).imported.sheet;
    expect(s.saves).toEqual(['str', 'con']);
    expect(s.skills).toEqual({ athletics: 'proficient', perception: 'expertise' });
  });

  it('keeps the page numbers the sheet would not work out as overrides, and no others', () => {
    const s = ok(fighter()).imported.sheet;
    // Chain mail and a shield are not modelled: AC is the page's. Everything else agrees.
    expect(s.overrides).toEqual({ ac: 18 });
    const n = deriveSheet(s);
    expect(n.saves.str.value).toBe(6);
    expect(n.skills.perception.value).toBe(7);
    expect(n.passivePerception.value).toBe(17);
  });

  it('reads attacks, equipment, coins, proficiencies, features and notes', () => {
    const { imported } = ok(fighter());
    const s = imported.sheet;
    expect(s.attacks.map((a) => [a.name, a.ability, a.proficient, a.bonus, a.damage])).toEqual([
      ['Longsword', 'none', false, 6, '1d8+3 slashing'],
      ['Heavy Crossbow', 'none', false, 4, '1d10+1 piercing'],
    ]);
    expect(s.equipment.map((i) => [i.quantity, i.name])).toEqual([
      [1, 'Chain mail'],
      [1, 'shield'],
      [1, 'longsword'],
      [2, 'handaxes'],
      [1, "explorer's pack (with rope, rations)"],
    ]);
    expect(s.gp).toBe(15.9);
    expect(s.otherProficiencies).toContain('Common, Dwarvish');
    expect(s.features.map((f) => f.name)).toEqual([
      'Fighting Style: Defense',
      'Second Wind',
      'Action Surge',
    ]);
    expect(imported.notes).toBe(
      'Personality traits: I face problems head-on.\n\nFlaws: I obey the law, even when it hurts.\n\nAlignment: Lawful Neutral',
    );
  });

  it('reads the same scores when the big box holds the score', () => {
    const flipped = fighter().map((f) =>
      f.name === 'STR' ? { ...f, value: '16' } : f.name === 'STRmod' ? { ...f, value: '+3' } : f,
    );
    expect(ok(flipped).imported.sheet.abilities.str).toBe(16);
  });

  it('reads spells under each level’s slot box, cantrips above the first, prepared by check box', () => {
    const spellPage: PdfField[] = [
      text('Spellcasting Class 2', 'Wizard', undefined, 3),
      text('SpellcastingAbility 2', 'INT', undefined, 3),
      text('SpellSaveDC  2', '13', undefined, 3),
      text('SpellAtkBonus 2', '+5', undefined, 3),
      // Cantrips: top of the first column, no slot box above.
      text('Spells 1014', 'Fire Bolt', [40, 607, 199, 620], 3),
      text('Spells 1016', 'Mage Hand', [40, 594, 199, 606], 3),
      // 1st level: its slot box, then spells; Shield prepared.
      text('SlotsTotal 19', '4', [52, 440, 91, 460], 3),
      text('Spells 1015', 'Magic Missile', [41, 422, 199, 432], 3),
      text('Spells 1023', 'Shield', [41, 408, 199, 418], 3),
      check('Check Box 309', true, [32, 407, 38, 416], 3),
      // 2nd level, lower in the same column; field numbers out of order, as on the real sheet.
      text('SlotsTotal 20', '2', [52, 229, 91, 250], 3),
      text('Spells 1046', 'Misty Step', [41, 210, 199, 220], 3),
      // 3rd level heads the next column, with no slots filled.
      text('SlotsTotal 21', '', [230, 600, 270, 620], 3),
    ];
    const wizard = fighter()
      .filter((f) => f.name !== 'ClassLevel')
      .concat([text('ClassLevel', 'Wizard 3')], spellPage);
    const s = ok(wizard).imported.sheet;
    expect(s.spellcastingAbility).toBe('int');
    expect(s.spells.map((x) => [x.name, x.level, x.prepared])).toEqual([
      ['Fire Bolt', 0, false],
      ['Magic Missile', 1, false],
      ['Mage Hand', 0, false],
      ['Shield', 1, true],
      ['Misty Step', 2, false],
    ]);
    expect(s.slots).toEqual([4, 2]);
  });
});

describe('the export a character app makes', () => {
  // Proficiency marks are letters beside each value; saves a dot. Passives are three fields.
  const caster = (): PdfField[] => [
    text('CharacterName', 'Orrin Vale'),
    text('CLASS  LEVEL', 'Wizard 3 / Cleric 2'),
    text('RACE', 'Dwarf'),
    text('BACKGROUND', 'Sage'),
    text('STR', '10'),
    text('STRmod', '+0'),
    text('DEX', '14'),
    text('DEXmod', '+2'),
    text('CON', '14'),
    text('CONmod', '+2'),
    text('INT', '17'),
    text('INTmod', '+3'),
    text('WIS', '14'),
    text('WISmod', '+2'),
    text('CHA', '8'),
    text('CHamod', '-1'),
    text('ProfBonus', '+3'),
    text('AC', '15'),
    text('Init', '+2'),
    text('Speed', '30 ft. (Walking)'),
    text('MaxHP', '32'),
    text('TempHP', '--'),
    text('ST Intelligence', '+6', row(610, 113)),
    text('IntProf', '•', [100, 610, 109, 618]),
    text('ST Wisdom', '+5', row(596, 113)),
    text('WisProf', '•', [100, 596, 109, 604]),
    text('Arcana', '+9', row(453)),
    text('ArcanaProf', 'E', [100, 453, 109, 462]),
    text('History', '+6', row(412)),
    text('HistoryProf', 'P', [100, 412, 109, 421]),
    text('Insight', '+2', row(399)),
    text('InsightProf', '', [100, 399, 109, 408]),
    text('Passive1', '12'),
    text('Passive2', '12'),
    text('Passive3', '13'),
    text('spellCastingAbility0', 'INT / WIS'),
    text('spellSaveDC0', '14 / 13'),
    text('spellAtkBonus0', '+6 / +5'),
    // Spell rows under their level headers; the 2nd level runs onto the next page.
    text('spellHeader0', '=== CANTRIPS ===', [42, 629, 148, 640], 6),
    text('spellSlotHeader0', '(At Will)', [149, 629, 231, 640], 6),
    text('spellName0', 'Fire Bolt', [42, 618, 148, 628], 6),
    text('spellPrepared0', 'O', [30, 618, 40, 628], 6),
    text('spellName1', 'Mage Hand', [42, 606, 148, 617], 6),
    text('spellHeader1', '=== 1st LEVEL ===', [42, 535, 148, 546], 6),
    text('spellSlotHeader1', '4 Slots OOOO', [149, 535, 231, 546], 6),
    text('spellName2', 'Magic Missile', [42, 523, 148, 534], 6),
    text('spellPrepared2', 'P', [30, 523, 40, 534], 6),
    text('spellName3', 'Detect Magic [R]', [42, 512, 148, 523], 6),
    text('spellName4', 'Cure Wounds', [42, 500, 148, 511], 6),
    text('spellHeader2', '=== 2nd LEVEL ===', [42, 206, 148, 217], 6),
    text('spellSlotHeader2', '2 Slots OO', [149, 206, 231, 217], 6),
    text('spellName5', 'Misty Step', [42, 194, 148, 205], 6),
    text('spellName6', 'Hold Person', [42, 629, 148, 640], 7),
    text('spellPrepared6', 'P', [30, 629, 40, 640], 7),
    // The same spell from two classes is listed twice; the sheet keeps one.
    text('spellName7', 'Hold Person', [42, 618, 148, 628], 7),
    text('Wpn Name', 'Fire Bolt'),
    text('Wpn1 AtkBonus', '+6'),
    text('Wpn1 Damage', '1d10 Fire'),
    text(
      'FeaturesTraits1',
      '=== WIZARD FEATURES ===\n\n* Spellcasting • 2024 rules 1\nYou can cast wizard spells.\n\n* Arcane Recovery • 2024 rules 1\nRegain spell slots on a Short Rest.',
    ),
    text(
      'FeaturesTraits2',
      '=== DWARF SPECIES TRAITS ===\n\n* Darkvision\nYou see in dim light within 120 feet.',
    ),
    text('Eq Name0', 'Quarterstaff'),
    text('Eq Qty0', '1'),
    text('Eq Name1', 'Rations (1 day)'),
    text('Eq Qty1', '10'),
    text('GP', '40'),
    text('Backstory', 'Raised in a mountain library.\nLeft to find a lost book.'),
  ];

  it('reads the export, with multiclass levels, its proficiency letters and passives', () => {
    const { imported, warnings } = ok(caster());
    expect(imported.layout).toBe('appExport');
    expect(imported.edition).toBe('2024');
    const s = imported.sheet;
    expect(s.classes.map((c) => `${c.name} ${c.level}`)).toEqual(['Wizard 3', 'Cleric 2']);
    expect(s.saves).toEqual(['int', 'wis']);
    expect(s.skills).toEqual({ arcana: 'expertise', history: 'proficient' });
    expect(s.spellcastingAbility).toBe('int');
    // The page's numbers agree with what the sheet works out, so nothing is overridden but AC.
    expect(s.overrides).toEqual({ ac: 15 });
    expect(warnings).toEqual([]);
  });

  it('reads spells by their headers, carrying a level onto the next page, and the slots', () => {
    const s = ok(caster()).imported.sheet;
    expect(s.spells.map((x) => [x.name, x.level, x.prepared])).toEqual([
      ['Fire Bolt', 0, false],
      ['Mage Hand', 0, false],
      ['Magic Missile', 1, true],
      ['Detect Magic', 1, false],
      ['Cure Wounds', 1, false],
      ['Misty Step', 2, false],
      ['Hold Person', 2, true],
    ]);
    expect(s.slots).toEqual([4, 2]);
  });

  it('reads features by section, equipment rows and the backstory', () => {
    const { imported } = ok(caster());
    const s = imported.sheet;
    expect(s.features.map((f) => [f.name, f.from, f.text])).toEqual([
      ['Spellcasting', 'Wizard', 'You can cast wizard spells.'],
      ['Arcane Recovery', 'Wizard', 'Regain spell slots on a Short Rest.'],
      ['Darkvision', 'Dwarf', 'You see in dim light within 120 feet.'],
    ]);
    expect(s.equipment.map((i) => [i.quantity, i.name])).toEqual([
      [1, 'Quarterstaff'],
      [10, 'Rations (1 day)'],
    ]);
    expect(s.gp).toBe(40);
    expect(imported.notes).toBe(
      'Backstory:\nRaised in a mountain library.\nLeft to find a lost book.',
    );
  });

  it('keeps a half-proficiency number as an override, not as proficiency', () => {
    const fields = caster().map((f) =>
      f.name === 'InsightProf'
        ? { ...f, value: 'H' }
        : f.name === 'Insight'
          ? { ...f, value: '+3' }
          : f,
    );
    const s = ok(fields).imported.sheet;
    expect(s.skills.insight).toBeUndefined();
    expect(s.overrides['skill.insight']).toBe(3);
  });
});

describe('a community sheet with dropdown scores', () => {
  it('reads the score from "14: +2" and the subclass after the level', () => {
    const { imported, warnings } = ok([
      text('CharacterName', 'Bryn Holt'),
      text('ClassLevel', 'Cleric 2 (Life)'),
      text('Race', 'Dwarf'),
      text('Background', 'Acolyte'),
      choice('StrDropdown', '  14:    +2'),
      choice('DexDropdown', '   8:    -1'),
      choice('ConDropdown', '  15:    +2'),
      choice('IntDropdown', '  10:    +0'),
      choice('WisDropdown', '  17:    +3'),
      choice('ChaDropdown', '  12:    +1'),
      text('Speeds', '25 ft.'),
    ]);
    expect(imported.layout).toBe('dropdowns');
    expect(imported.sheet.abilities).toEqual({
      str: 14,
      dex: 8,
      con: 15,
      int: 10,
      wis: 17,
      cha: 12,
    });
    expect(imported.sheet.classes).toEqual([{ name: 'Cleric', subclass: 'Life', level: 2 }]);
    expect(imported.sheet.speed).toBe(25);
    expect(warnings).toEqual(['No hit point maximum on the sheet; set it on the sheet.']);
  });
});

describe('PDFs that are not a filled character sheet', () => {
  it('says so for no fields, other fields, and a blank template', () => {
    expect(readPdfSheet([])).toMatchObject({ ok: false, problem: 'noFields' });
    expect(readPdfSheet([text('Invoice number', '42'), text('Total', '9.99')])).toMatchObject({
      ok: false,
      problem: 'unknownLayout',
    });
    // A blank template's defaults (a score dropdown at 10, a speed) are not a character.
    expect(
      readPdfSheet([
        text('CharacterName', ''),
        text('ClassLevel', ''),
        choice('StrDropdown', '  10:    +0'),
        text('Speeds', '30 ft.'),
      ]),
    ).toMatchObject({ ok: false, problem: 'empty' });
  });

  it('warns about what is missing instead of failing', () => {
    const { imported, warnings } = ok([text('CharacterName', 'Ash'), text('STR', '12')]);
    expect(imported.name).toBe('Ash');
    expect(imported.sheet.abilities.str).toBe(12);
    expect(warnings).toEqual([
      'No class and level on the sheet; set them on the sheet.',
      'No score for DEX, CON, INT, WIS, CHA; left at 10.',
      'No hit point maximum on the sheet; set it on the sheet.',
    ]);
  });
});

describe('the official 2024 sheet', () => {
  // Generic field names, the same in every copy (sheet2024.ts); SRD content.
  const cleric = (): PdfField[] => [
    text('Text1', 'Hale Ironbrow'),
    text('Text6', 'Acolyte'),
    text('Text7', 'Cleric'),
    text('Text8', 'Dwarf'),
    text('Text9', 'Life Domain'),
    text('Text11', '3'),
    text('Text13', '18'),
    text('Text16', '27'),
    text('Text19', '+2'),
    text('Text26', '+0'),
    text('Text27', '30 ft.'),
    text('Text29', '13'),
    // Scores in the small box, modifiers in the circle.
    text('Text64', '14'),
    text('Text21', '+2'),
    text('Text66', '10'),
    text('Text22', '+0'),
    text('Text67', '14'),
    text('Text24', '+2'),
    text('Text63', '10'),
    text('Text20', '+0'),
    text('Text65', '16'),
    text('Text23', '+3'),
    text('Text68', '12'),
    text('Text25', '+1'),
    text('Text75', '+5'),
    check('Check Box21', true, [0, 0, 0, 0]),
    text('Text81', '+3'),
    check('Check Box26', true, [0, 0, 0, 0]),
    text('Text71', '+2'),
    check('Check Box17', true, [0, 0, 0, 0]),
    text('Text78', '+5'),
    check('Check Box25', true, [0, 0, 0, 0]),
    check('Check Box13', true, [0, 0, 0, 0]),
    check('Check Box12', true, [0, 0, 0, 0]),
    text('Text59', 'Simple weapons'),
    text('Text98', 'Common, Dwarvish'),
    text('Text30', 'Mace'),
    text('Text31', '+4'),
    text('Text32', '1d6+2 Bludgeoning'),
    text('Text38', 'Sacred Flame'),
    text('Text39', 'DC 13 DEX'),
    text('Text40', '1d8 Radiant'),
    text(
      'Text54',
      'Spellcasting (WIS)\nChannel Divinity (2 / short rest): Divine Spark, Turn Undead',
    ),
    text(
      'Text55',
      'LIFE DOMAIN\nDisciple of Life: healing spells restore extra 2 + spell level HP',
    ),
    text('Text57', 'Darkvision (120 ft.)'),
    text('Text111', 'Wisdom'),
    text('Text94', '13'),
    text('Text95', '+5'),
    text('Text112', '4'),
    text('Text113', '2'),
    text('Text105.0', '0'),
    text('Text106.0', 'Sacred Flame'),
    check('Check Box252.0', false, [0, 0, 0, 0]),
    text('Text105.1', '1'),
    text('Text106.1', 'Bless'),
    text('Text105.2', '2'),
    text('Text106.2', 'Spiritual Weapon'),
    text('Text99', 'Chain Mail, Shield, Mace'),
    text('Text101', 'Bag of Holding'),
    text('Text269', '15'),
    text('Text267', '5'),
  ];

  it('reads the sheet by its generic field names', () => {
    const { imported, warnings } = ok(cleric());
    expect(imported.layout).toBe('sheet2024');
    expect(imported.edition).toBe('2024');
    expect(imported.name).toBe('Hale Ironbrow');
    const s = imported.sheet;
    expect(s.classes).toEqual([{ name: 'Cleric', subclass: 'Life Domain', level: 3 }]);
    expect([s.species, s.background, s.maxHp, s.speed]).toEqual(['Dwarf', 'Acolyte', 27, 30]);
    expect(s.abilities).toEqual({ str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 });
    expect(s.saves).toEqual(['wis', 'cha']);
    expect(s.skills).toEqual({ history: 'proficient', medicine: 'proficient' });
    expect(s.spellcastingAbility).toBe('wis');
    expect(s.overrides).toEqual({ ac: 18 });
    expect(s.otherProficiencies).toBe(
      'Armor: Light, Shields\nWeapons: Simple weapons\nLanguages: Common, Dwarvish',
    );
    expect(s.gp).toBe(15.5);
    expect(warnings).toEqual([]);
  });

  it('takes spell levels from their column, as prepared, and slots from their totals', () => {
    const s = ok(cleric()).imported.sheet;
    expect(s.spells.map((x) => [x.name, x.level, x.prepared])).toEqual([
      ['Sacred Flame', 0, false],
      ['Bless', 1, true],
      ['Spiritual Weapon', 2, true],
    ]);
    expect(s.slots).toEqual([4, 2]);
  });

  it('keeps a save DC with the damage, and reads features by box and heading', () => {
    const s = ok(cleric()).imported.sheet;
    expect(s.attacks.map((a) => [a.name, a.bonus, a.damage])).toEqual([
      ['Mace', 4, '1d6+2 Bludgeoning'],
      ['Sacred Flame', 0, '1d8 Radiant (DC 13 DEX)'],
    ]);
    expect(s.features.map((f) => [f.name, f.from, f.text])).toEqual([
      ['Spellcasting (WIS)', 'Cleric', ''],
      ['Channel Divinity: Divine Spark, Turn Undead', 'Cleric', ''],
      ['Disciple of Life', 'Life Domain', 'healing spells restore extra 2 + spell level HP'],
      ['Darkvision (120 ft.)', 'Dwarf', ''],
    ]);
    expect(s.equipment.map((i) => i.name)).toEqual([
      'Chain Mail',
      'Shield',
      'Mace',
      'Bag of Holding',
    ]);
    // "(2 / short rest)" becomes the feature's limited uses (ADR 0074), out of its name.
    expect(s.features[1]!.uses).toEqual({ max: 2, used: 0, reset: 'short' });
  });
});
