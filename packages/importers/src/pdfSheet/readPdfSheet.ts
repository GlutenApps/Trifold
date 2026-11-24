import { ulid } from 'ulid';
import { deriveSheet, blankSheet, scoreModifier } from '@trifold/rules';
import { fromSheet2024, isSheet2024 } from './sheet2024';
import type {
  Ability,
  CharacterEdition,
  DerivedKey,
  Sheet,
  SheetFeature,
  SheetItem,
  SheetSpell,
  Skill,
} from '@trifold/schema';

/**
 * Import from PDF (docs/PLAYER-MODE.md, Way 2; ADR 0073): a character sheet another app exported,
 * read from its fields into a Trifold sheet. Pure: main reads the PDF's fields with pdf.js and
 * hands them here; nothing is written until the player confirms the preview.
 *
 * Fields are read by name, case and spacing ignored, in the field sets the corpus shows
 * (DATA-FORMATS.md §5.8): the official 2014 sheet's (`ClassLevel`, `ST Strength`, `Check Box 23`),
 * the large export a character app makes (`CLASS  LEVEL`, `AcrobaticsProf`, `spellName0`), and a
 * community sheet whose scores are dropdowns (`StrDropdown` = "14: +2"). Where a name does not
 * say enough (which save a check box marks, which level a spell is), position on the page does.
 */

export interface PdfField {
  /** 1-based page number. */
  page: number;
  /** The fully qualified field name. */
  name: string;
  kind: 'text' | 'check' | 'choice' | 'other';
  /** The text, or the chosen option; empty for a check box. */
  value: string;
  /** A check box or radio button that is on. */
  checked: boolean;
  /** [x1, y1, x2, y2] in PDF points, origin at the bottom left. */
  rect: [number, number, number, number];
}

export type PdfSheetLayout = 'sheet2024' | 'sheet2014' | 'appExport' | 'dropdowns' | 'other';

export interface ImportedSheet {
  name: string;
  edition: CharacterEdition;
  sheet: Sheet;
  /** Personality, ideals, bonds, flaws, backstory and appearance, for the character's notes. */
  notes: string;
  layout: PdfSheetLayout;
}

export type PdfSheetProblem =
  /** No fields at all: printed to PDF, scanned, or never fillable. */
  | 'noFields'
  /** Fields, but none a character sheet has. */
  | 'unknownLayout'
  /** A character sheet's fields, all empty. */
  | 'empty';

export type PdfSheetResult =
  | { ok: true; imported: ImportedSheet; warnings: string[] }
  | { ok: false; problem: PdfSheetProblem; warnings: string[] };

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const SAVE_FIELD: Record<Ability, string> = {
  str: 'st strength',
  dex: 'st dexterity',
  con: 'st constitution',
  int: 'st intelligence',
  wis: 'st wisdom',
  cha: 'st charisma',
};

/** Each skill's value field, as both field sets name it. */
const SKILL_FIELD: Record<Skill, string[]> = {
  acrobatics: ['acrobatics'],
  animalHandling: ['animal', 'animal handling', 'animalhandling'],
  arcana: ['arcana'],
  athletics: ['athletics'],
  deception: ['deception'],
  history: ['history'],
  insight: ['insight'],
  intimidation: ['intimidation'],
  investigation: ['investigation'],
  medicine: ['medicine'],
  nature: ['nature'],
  perception: ['perception'],
  performance: ['performance'],
  persuasion: ['persuasion'],
  religion: ['religion'],
  sleightOfHand: ['sleightofhand', 'sleight of hand'],
  stealth: ['stealth'],
  survival: ['survival'],
};

const ABILITY_WORD: Record<string, Ability> = {
  str: 'str',
  dex: 'dex',
  con: 'con',
  int: 'int',
  wis: 'wis',
  cha: 'cha',
};

/** A field name as matched: lower case, runs of spaces made one, trimmed. */
export function fieldKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "+3", "-1", "−2", "–1": a signed number, or null. */
function signed(text: string): number | null {
  const m = /^\s*([+\-−–])\s*(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  return m[1] === '+' ? Number(m[2]) : -Number(m[2]);
}

/** A bonus written signed or plain ("+5", "5", "-1"). */
function bonus(text: string): number | null {
  const s = signed(text);
  if (s !== null) return s;
  const m = /^\s*(\d{1,2})\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

/** The first whole number in a text ("25 ft. (Walking)" → 25). */
function firstNumber(text: string): number | null {
  const m = /-?\d+/.exec(text.replace(/,/g, ''));
  return m ? Number(m[0]) : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const centreY = (f: PdfField) => (f.rect[1] + f.rect[3]) / 2;
const top = (f: PdfField) => Math.max(f.rect[1], f.rect[3]);
const bottom = (f: PdfField) => Math.min(f.rect[1], f.rect[3]);
const left = (f: PdfField) => Math.min(f.rect[0], f.rect[2]);
const right = (f: PdfField) => Math.max(f.rect[0], f.rect[2]);

/**
 * An ability's score from the field pair a sheet gives it. On the 2014 sheet the big box is
 * printed for the modifier and the small oval for the score, and apps fill them both ways, so the
 * value decides: a signed number is a modifier, a plain 1–30 the score (DATA-FORMATS.md §5.8).
 */
export function readScore(values: string[]): { score: number | null; modifier: number | null } {
  let score: number | null = null;
  let modifier: number | null = null;
  const plain: number[] = [];
  for (const raw of values) {
    const text = raw.trim();
    if (!text) continue;
    // A dropdown's "14: +2" carries both.
    const both = /^(\d{1,2})\s*:\s*([+\-−–]?\s*\d{1,2})$/.exec(text);
    if (both) {
      score = Number(both[1]);
      modifier = bonus(both[2]!);
      continue;
    }
    const s = signed(text);
    if (s !== null) {
      modifier = s;
      continue;
    }
    const n = /^\d{1,2}$/.test(text) ? Number(text) : null;
    if (n !== null) plain.push(n);
  }
  if (score === null) {
    if (plain.length === 1) {
      const n = plain[0]!;
      if (n >= 1 && n <= 30 && (modifier === null || scoreModifier(n) === modifier)) score = n;
      else if (modifier === null) modifier = n;
    } else if (plain.length >= 2) {
      const [a, b] = plain as [number, number];
      if (scoreModifier(a) === b) [score, modifier] = [a, b];
      else if (scoreModifier(b) === a) [score, modifier] = [b, a];
      else score = Math.max(a, b);
    }
  }
  if (score !== null && (score < 1 || score > 30)) score = null;
  return { score, modifier };
}

/** "Artificer 6 / Bard 2", "Cleric 2 (Life)", "Fighter (Champion) 5". */
export function readClasses(text: string): Sheet['classes'] {
  const parts = text
    .split(/\s*[/,]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: Sheet['classes'] = [];
  for (const raw of parts) {
    // "Fixture Tinkerer LVL 3", "Wizard Level 5".
    const part = raw.replace(/\s+(?:lvl|level|lv)\.?\s*(?=\d)/i, ' ');
    const after = /^(.*?)\s+(\d{1,2})\s*(?:\(([^)]*)\))?$/.exec(part);
    const before = /^(.*?)\s*\(([^)]*)\)\s*(\d{1,2})$/.exec(part);
    const name = (before?.[1] ?? after?.[1] ?? '').trim();
    const level = Number(before?.[3] ?? after?.[2] ?? 0);
    const subclass = (before?.[2] ?? after?.[3] ?? '').trim();
    if (!name || level < 1 || level > 20) return [];
    out.push({ name: name.slice(0, 80), subclass: subclass.slice(0, 80), level });
  }
  return out.slice(0, 13);
}

/** A mark beside a save or skill: proficient, expertise, half (Jack of All Trades) or none. */
function markOf(field: PdfField | undefined): 'proficient' | 'expertise' | 'half' | null {
  if (!field) return null;
  if (field.kind === 'check') return field.checked ? 'proficient' : null;
  const v = field.value.trim().toUpperCase();
  if (!v || v === 'OFF') return null;
  if (v === 'E') return 'expertise';
  if (v === 'H') return 'half';
  return 'proficient';
}

/** Personality and appearance fields, in the order the notes list them. */
const NOTE_FIELDS: Array<[string, string[]]> = [
  ['Personality traits', ['personalitytraits', 'personality traits', 'personality']],
  ['Ideals', ['ideals']],
  ['Bonds', ['bonds']],
  ['Flaws', ['flaws']],
  ['Backstory', ['backstory', 'character backstory']],
  ['Allies and organizations', ['allies', 'allies & organizations']],
  ['Alignment', ['alignment']],
  ['Faith', ['faith']],
  ['Gender', ['gender']],
  ['Age', ['age']],
  ['Size', ['size']],
  ['Height', ['height']],
  ['Weight', ['weight']],
  ['Eyes', ['eyes']],
  ['Skin', ['skin']],
  ['Hair', ['hair']],
  ['Appearance', ['appearance', 'character appearance']],
];

/** Every name a character sheet's core fields go by; a PDF with none of them is not one. */
const CORE_FIELDS = [
  'charactername',
  'class level',
  'classlevel',
  'race',
  'species',
  'str',
  'strmod',
  'strdropdown',
  'ac',
  'hpmax',
  'maxhp',
];

/** Values blank templates ship that mean nothing was filled in. */
const PLACEHOLDER = /^(--|—|–|-|\.|n\/a)$/i;

export function readPdfSheet(pdfFields: readonly PdfField[]): PdfSheetResult {
  const warnings: string[] = [];
  if (pdfFields.length === 0) return { ok: false, problem: 'noFields', warnings };
  // The official 2024 sheet's generic names, translated into the ones read below.
  const is2024 = isSheet2024(new Set(pdfFields.map((f) => fieldKey(f.name))));
  const fields = is2024 ? fromSheet2024(pdfFields) : pdfFields;

  // The first field with a value wins a name; the export repeats the header on every page.
  const byKey = new Map<string, PdfField>();
  for (const f of fields) {
    const key = fieldKey(f.name);
    const had = byKey.get(key);
    if (!had || (!had.value.trim() && f.value.trim()) || (!had.checked && f.checked)) {
      byKey.set(key, f);
    }
  }
  const field = (...keys: string[]) => {
    for (const k of keys) {
      const f = byKey.get(k);
      if (f && (f.value.trim() || f.checked)) return f;
    }
    return undefined;
  };
  const text = (...keys: string[]) => {
    const v = field(...keys)?.value.trim() ?? '';
    return PLACEHOLDER.test(v) ? '' : v;
  };

  if (!CORE_FIELDS.some((k) => byKey.has(k))) {
    return { ok: false, problem: 'unknownLayout', warnings };
  }

  const layout: PdfSheetLayout = is2024
    ? 'sheet2024'
    : byKey.has('spellname0') || byKey.has('class level')
      ? 'appExport'
      : byKey.has('strdropdown')
        ? 'dropdowns'
        : byKey.has('classlevel') && byKey.has('st strength')
          ? 'sheet2014'
          : 'other';

  const sheet = blankSheet();
  const name = text('charactername').slice(0, 80);

  // Classes.
  const classText = text('class level', 'classlevel', 'class & level', 'class');
  const classes = classText ? readClasses(classText) : [];
  if (classText && !classes.length) {
    warnings.push(
      `The class line "${classText}" did not read as classes and levels; set them on the sheet.`,
    );
  } else if (!classText) {
    warnings.push('No class and level on the sheet; set them on the sheet.');
  }
  sheet.classes = classes.map((c) => ({ ...c }));
  sheet.species = text('race', 'species').slice(0, 80);
  sheet.background = text('background').slice(0, 80);

  // Ability scores.
  const missingScores: string[] = [];
  for (const a of ABILITIES) {
    const values = [a, `${a}mod`, `${a}dropdown`, `${a} score`]
      .map((k) => byKey.get(k)?.value ?? '')
      .filter((v) => v.trim());
    const { score, modifier } = readScore(values);
    if (score !== null) sheet.abilities[a] = score;
    else if (modifier !== null) {
      sheet.abilities[a] = clamp(10 + modifier * 2, 1, 30);
      warnings.push(
        `Only ${a.toUpperCase()}'s modifier was on the sheet; its score is set to ${sheet.abilities[a]}.`,
      );
    } else missingScores.push(a.toUpperCase());
  }
  if (missingScores.length === ABILITIES.length) {
    warnings.push('No ability scores were on the sheet; they are left at 10.');
  } else if (missingScores.length) {
    warnings.push(`No score for ${missingScores.join(', ')}; left at 10.`);
  }

  // Numbers read off the page, kept as overrides where the sheet would work out something else.
  const read: Partial<Record<DerivedKey, number>> = {};
  const pb = bonus(text('profbonus', 'proficiency bonus'));
  if (pb !== null) read.proficiencyBonus = pb;
  const ac = firstNumber(text('ac', 'armor class'));
  if (ac !== null) read.ac = ac;
  const init = bonus(text('init', 'initiative', 'initiativebonus'));
  if (init !== null) read.initiative = init;
  const speed = firstNumber(text('speed', 'speeds'));
  if (speed !== null) sheet.speed = clamp(speed, 0, 200);
  const maxHp = firstNumber(text('maxhp', 'hpmax', 'hp max', 'max hp'));
  if (maxHp !== null && maxHp >= 1) sheet.maxHp = clamp(maxHp, 1, 999);
  else warnings.push('No hit point maximum on the sheet; set it on the sheet.');
  const passive = (k: DerivedKey, ...keys: string[]) => {
    const n = firstNumber(text(...keys));
    if (n !== null) read[k] = n;
  };
  if (layout === 'appExport') {
    passive('passivePerception', 'passive1');
    passive('passiveInsight', 'passive2');
    passive('passiveInvestigation', 'passive3');
  } else {
    passive('passivePerception', 'passive', 'passive perception', 'passiveperception');
  }

  // Saves and skills: the value field, and the mark beside it (a check box, or P/E/H/•).
  const marks = fields.filter(
    (f) =>
      (f.kind === 'check' && f.checked) ||
      (f.kind === 'text' && /^[PEH•●◆■xX✓✔]$/.test(f.value.trim())),
  );
  const markBeside = (value: PdfField | undefined) => {
    if (!value) return undefined;
    let best: PdfField | undefined;
    let gap = Infinity;
    for (const m of marks) {
      if (m.page !== value.page || m === value) continue;
      if (Math.abs(centreY(m) - centreY(value)) > 4) continue;
      const g = left(value) - right(m);
      if (g < -2 || g > 20) continue;
      if (g < gap) [best, gap] = [m, g];
    }
    return best;
  };
  const proficiency = pb ?? 2;
  for (const a of ABILITIES) {
    const valueField = byKey.get(SAVE_FIELD[a]);
    const mark = markOf(field(`${a}prof`)) ?? markOf(markBeside(valueField));
    if (mark === 'proficient' || mark === 'expertise') sheet.saves.push(a);
    const n = bonus(valueField?.value ?? '');
    if (n !== null) read[`save.${a}`] = n;
  }
  for (const s of Object.keys(SKILL_FIELD) as Skill[]) {
    const valueField = SKILL_FIELD[s].map((k) => byKey.get(k)).find(Boolean);
    const named = SKILL_FIELD[s].map((k) => field(`${k}prof`)).find(Boolean);
    let mark = markOf(named) ?? markOf(markBeside(valueField));
    const n = bonus(valueField?.value ?? '');
    if (n !== null) read[`skill.${s}`] = n;
    // A check box cannot say expertise; the number can.
    if (mark === 'proficient' && n !== null) {
      const ability = SKILL_ABILITY_OF[s];
      if (n - scoreModifier(sheet.abilities[ability]) === proficiency * 2) mark = 'expertise';
    }
    if (mark === 'proficient' || mark === 'expertise') sheet.skills[s] = mark;
  }

  sheet.otherProficiencies = text('proficiencieslang', 'proficiencies & languages').slice(0, 2000);

  // Spellcasting.
  const castWord = text(
    'spellcastingability0',
    'spellcastingability 2',
    'spellcastingability',
    'spellcasting ability',
  );
  const cast = ABILITY_WORD[castWord.slice(0, 3).toLowerCase()];
  sheet.spellcastingAbility = cast ?? null;
  const dc = firstNumber(text('spellsavedc0', 'spellsavedc 2', 'spellsavedc', 'spell save dc'));
  if (dc !== null) read.spellSaveDc = dc;
  const atk = bonus(
    text('spellatkbonus0', 'spellatkbonus 2', 'spellatkbonus', 'spell attack bonus').split(
      '/',
    )[0] ?? '',
  );
  if (atk !== null) read.spellAttack = atk;

  const spells = readSpells(fields, byKey);
  sheet.spells = spells.spells;
  sheet.slots = spells.slots;
  if (spells.unsure) {
    warnings.push(
      `${spells.unsure} spell${spells.unsure === 1 ? "'s" : "s'"} level could not be told from the page; check them on the sheet.`,
    );
  }

  // Attacks: Wpn Name, Wpn Name 2…, with Wpn1 AtkBonus and Wpn1 Damage.
  const attackRows = [...byKey.keys()]
    .map((k) => /^wpn name(?: (\d+))?$/.exec(k))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1] ?? 1))
    .sort((a, b) => a - b);
  for (const n of attackRows) {
    const nameText = text(n === 1 ? 'wpn name' : `wpn name ${n}`);
    if (!nameText) continue;
    const hitText = text(`wpn${n} atkbonus`);
    const hit = bonus(hitText);
    // A cantrip's "DC 15 DEX" is not a bonus: it stays with the damage.
    const damage = [text(`wpn${n} damage`), hit === null && hitText ? `(${hitText})` : '']
      .filter(Boolean)
      .join(' ');
    sheet.attacks.push({
      id: ulid(),
      name: nameText.slice(0, 80),
      ability: 'none',
      proficient: false,
      bonus: clamp(hit ?? 0, -10, 20),
      damage: damage.slice(0, 80),
    });
  }

  sheet.features = readFeatures(byKey, {
    className: classes[0]?.name ?? '',
    subclass: classes[0]?.subclass ?? '',
    species: sheet.species,
  }).map(withUses);
  sheet.equipment = readEquipment(byKey, text('equipment'));

  // Coins, each as itself (docs/CHARACTER-SHEET.md, item 4).
  const coin = (k: string) => clamp(Math.floor(firstNumber(text(k)) ?? 0), 0, 10_000_000);
  sheet.gp = coin('gp');
  if (coin('pp') || coin('ep') || coin('sp') || coin('cp')) {
    sheet.coins = { pp: coin('pp'), ep: coin('ep'), sp: coin('sp'), cp: coin('cp') };
  }

  // Overrides: what the page says, where the sheet would work out something else.
  const derived = deriveSheet(sheet);
  const base: Partial<Record<DerivedKey, number>> = {
    proficiencyBonus: derived.proficiencyBonus.base,
    ac: derived.ac.base,
    initiative: derived.initiative.base,
    passivePerception: derived.passivePerception.base,
    passiveInsight: derived.passiveInsight.base,
    passiveInvestigation: derived.passiveInvestigation.base,
    ...(derived.spellSaveDc ? { spellSaveDc: derived.spellSaveDc.base } : {}),
    ...(derived.spellAttack ? { spellAttack: derived.spellAttack.base } : {}),
    ...Object.fromEntries(ABILITIES.map((a) => [`save.${a}`, derived.saves[a].base])),
    ...Object.fromEntries(
      (Object.keys(derived.skills) as Skill[]).map((s) => [`skill.${s}`, derived.skills[s].base]),
    ),
  };
  // A proficiency bonus override changes what saves and skills work out to; settle it first.
  if (read.proficiencyBonus !== undefined && read.proficiencyBonus !== base.proficiencyBonus) {
    sheet.overrides.proficiencyBonus = clamp(read.proficiencyBonus, -20, 99);
  }
  return finish();

  function finish(): PdfSheetResult {
    const again = deriveSheet(sheet);
    const now: Partial<Record<DerivedKey, number>> = {
      ...base,
      ...Object.fromEntries(ABILITIES.map((a) => [`save.${a}`, again.saves[a].base])),
      ...Object.fromEntries(
        (Object.keys(again.skills) as Skill[]).map((s) => [`skill.${s}`, again.skills[s].base]),
      ),
      ...(again.spellSaveDc ? { spellSaveDc: again.spellSaveDc.base } : {}),
      ...(again.spellAttack ? { spellAttack: again.spellAttack.base } : {}),
    };
    for (const [k, v] of Object.entries(read) as Array<[DerivedKey, number]>) {
      if (k === 'proficiencyBonus') continue;
      // Passives follow their skills unless the page says otherwise.
      const worked =
        k === 'passivePerception'
          ? 10 + (read['skill.perception'] ?? now['skill.perception'] ?? 0)
          : k === 'passiveInsight'
            ? 10 + (read['skill.insight'] ?? now['skill.insight'] ?? 0)
            : k === 'passiveInvestigation'
              ? 10 + (read['skill.investigation'] ?? now['skill.investigation'] ?? 0)
              : now[k];
      if (worked !== v) sheet.overrides[k] = clamp(v, -20, 99);
    }

    // Scores alone are not enough: a blank template's dropdowns default to 10.
    const filled = !!name || classes.length > 0 || maxHp !== null;
    if (!filled) return { ok: false, problem: 'empty', warnings };
    if (!name) warnings.push('No character name on the sheet.');

    const allText = fields.map((f) => f.value).join('\n');
    const edition: CharacterEdition = is2024 || /\b2024\b|XPHB/.test(allText) ? '2024' : '2014';

    return {
      ok: true,
      imported: { name, edition, sheet, notes: readNotes(text), layout },
      warnings,
    };
  }
}

/** Which ability a skill uses, for telling expertise from a check box's plain proficiency. */
const SKILL_ABILITY_OF: Record<Skill, Ability> = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

/** "=== 1st LEVEL ===" → 1, "=== CANTRIPS ===" → 0. */
function headerLevel(text: string): number | null {
  if (/cantrip/i.test(text)) return 0;
  const m = /(\d)\s*(?:st|nd|rd|th)?\s*level/i.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * Spells and slots. The export lists spells as `spellName0`… under `spellHeader` rows
 * ("=== 1st LEVEL ===", "4 Slots OOOO" beside it) and carries a level onto the next page; the
 * 2014 sheet's `Spells 1014`… sit under each level's `SlotsTotal 19`… box (19 is 1st level), with
 * the cantrips above the first box. A spell takes the level of the nearest marker above it in its
 * column.
 */
function readSpells(
  fields: readonly PdfField[],
  byKey: Map<string, PdfField>,
): { spells: SheetSpell[]; slots: number[]; unsure: number } {
  interface Marker {
    field: PdfField;
    level: number;
  }
  const markers: Marker[] = [];
  const slots: number[] = [];
  let headed = false;
  for (const f of fields) {
    const key = fieldKey(f.name);
    const header = /^spellheader(\d+)$/.exec(key);
    if (header) {
      const level = headerLevel(f.value);
      if (level === null) continue;
      headed = true;
      markers.push({ field: f, level });
      const slotText = byKey.get(`spellslotheader${header[1]}`)?.value ?? '';
      const count = /(\d+)\s*slots?/i.exec(slotText);
      if (level >= 1 && count) slots[level - 1] = clamp(Number(count[1]), 0, 9);
      continue;
    }
    const total = /^slotstotal (\d+)$/.exec(key);
    if (total) {
      const level = Number(total[1]) - 18;
      if (level < 1 || level > 9) continue;
      markers.push({ field: f, level });
      const n = firstNumber(f.value);
      if (n !== null && n > 0) slots[level - 1] = clamp(n, 0, 9);
    }
  }

  const spellFields = fields
    .map((f) => {
      const key = fieldKey(f.name);
      const m =
        /^spellname(\d+)$/.exec(key) ??
        /^spells (\d+)$/.exec(key) ??
        /^spell name (\d+)$/.exec(key);
      return m && f.value.trim()
        ? {
            f,
            n: Number(m[1]),
            exportRow: key.startsWith('spellname'),
            levelled: key.startsWith('spell name'),
          }
        : null;
    })
    .filter((x): x is { f: PdfField; n: number; exportRow: boolean; levelled: boolean } => !!x)
    .sort((a, b) => a.f.page - b.f.page || a.n - b.n);

  const checks = fields.filter((f) => f.kind === 'check' && f.checked);
  const spells: SheetSpell[] = [];
  const seen = new Set<string>();
  let carried: number | null = null;
  let unsure = 0;
  for (const { f, n, exportRow, levelled } of spellFields) {
    // The 2024 sheet writes each row's level in its own column, and lists only cantrips and
    // prepared spells.
    const written = levelled ? firstNumber(byKey.get(`spell level ${n}`)?.value ?? '') : null;
    let level: number | null = written !== null && written >= 0 && written <= 9 ? written : null;
    let gap = Infinity;
    for (const m of levelled ? [] : markers) {
      if (m.field.page !== f.page) continue;
      const overlaps = left(m.field) < right(f) && right(m.field) > left(f);
      const above = bottom(m.field) >= top(f) - 2;
      if (!overlaps || !above) continue;
      const g = bottom(m.field) - top(f);
      if (g < gap) [level, gap] = [m.level, g];
    }
    if (level === null) {
      // The export carries a level onto the next page; the 2014 sheet's cantrips have no box.
      if (headed && carried !== null) level = carried;
      else if (!headed && markers.length) level = 0;
    }
    if (level === null) {
      unsure += 1;
      level = 0;
    }
    carried = level;
    const prepared = levelled
      ? true
      : exportRow
        ? /^p$/i.test(byKey.get(`spellprepared${n}`)?.value.trim() ?? '')
        : checks.some(
            (c) =>
              c.page === f.page &&
              Math.abs(centreY(c) - centreY(f)) <= 4 &&
              left(f) - right(c) >= -2 &&
              left(f) - right(c) <= 14,
          );
    const name = f.value
      .replace(/\s*\[R\]\s*$/i, '')
      .trim()
      .slice(0, 120);
    const key = `${level}:${name.toLowerCase()}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    spells.push({ id: ulid(), name, level, prepared: level > 0 && prepared });
  }
  // Slots up to the highest level any were found for.
  const out: number[] = [];
  for (let i = 0; i < slots.length; i++) out.push(slots[i] ?? 0);
  return { spells: spells.slice(0, 500), slots: out.slice(0, 9), unsure };
}

/**
 * Features. The export writes `FeaturesTraits1`… as "=== ARTIFICER FEATURES ===" sections of
 * "* Name • Source page" entries with their text below; a sheet that is free text becomes one
 * feature per paragraph, named by its first line.
 */
function readFeatures(
  byKey: Map<string, PdfField>,
  context: { className: string; subclass: string; species: string },
): SheetFeature[] {
  const parts: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const v = byKey.get(`featurestraits${i}`)?.value;
    if (v?.trim()) parts.push(v);
  }
  const out: SheetFeature[] = [];
  if (parts.length) {
    let from = '';
    let current: SheetFeature | null = null;
    for (const raw of parts.join('\n').split(/\r?\n/)) {
      const line = raw.trimEnd();
      const section = /^===\s*(.+?)\s*===$/.exec(line.trim());
      if (section) {
        // "ROCK GNOME SPECIES TRAITS" → "Rock gnome"; "ARTIFICER FEATURES" → "Artificer".
        const words = section[1]!.replace(/\s+(?:species\s+)?(?:features?|traits?)$/i, '');
        from = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
        current = null;
        continue;
      }
      const entry = /^\*\s+(.+)$/.exec(line.trim());
      if (entry) {
        // "Bardic Inspiration • Source 59": the name, before the source.
        const title = entry[1]!.split(/\s+[•·](?:\s+|$)/)[0]!.trim();
        current = { id: ulid(), name: title.slice(0, 120), from: from.slice(0, 80), text: '' };
        out.push(current);
        continue;
      }
      if (current)
        current.text = `${current.text}${current.text ? '\n' : ''}${line}`.slice(0, 20_000);
    }
    for (const f of out) f.text = f.text.trim();
    return out.slice(0, 300);
  }
  // The 2024 sheet's boxes: class features, species traits and feats, a feature per line.
  const boxes: Array<[string, string]> = [
    ['class features 1', context.className],
    ['class features 2', context.className],
    ['species traits', context.species],
    ['feats', 'Feat'],
  ];
  if (boxes.some(([k]) => byKey.get(k)?.value.trim())) {
    for (const [k, label] of boxes) {
      let from = label;
      for (const raw of (byKey.get(k)?.value ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        // An all-capitals line heads what follows: "LIFE DOMAIN".
        if (/^[^a-z]*[A-Z][^a-z]*$/.test(line) && line.length <= 60) {
          // The subclass keeps its own capitals ("LIFE DOMAIN" → "Life Domain").
          from =
            line.toLowerCase() === context.subclass.toLowerCase()
              ? context.subclass
              : line.charAt(0) + line.slice(1).toLowerCase();
          continue;
        }
        out.push({ id: ulid(), ...nameAndText(line), from: from.slice(0, 80) });
      }
    }
    return out.slice(0, 300);
  }
  const free = [
    'features and traits',
    'featurestraits',
    'features & traits',
    'features',
    'feat+traits',
  ]
    .map((k) => byKey.get(k)?.value ?? '')
    .find((v) => v.trim());
  if (!free) return [];
  for (const para of free.split(/\n\s*\n/)) {
    const lines = para
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => l.length <= 100)) {
      for (const l of lines) out.push({ id: ulid(), name: l.slice(0, 120), from: '', text: '' });
    } else {
      out.push({
        id: ulid(),
        name: lines[0]!.slice(0, 120),
        from: '',
        text: lines.slice(1).join('\n').slice(0, 20_000),
      });
    }
  }
  return out.slice(0, 300);
}

/**
 * A feature whose name says its uses, "Channel Divinity (2 / short rest)", gets them as limited
 * uses (ADR 0074), and the note leaves the name.
 */
function withUses(f: SheetFeature): SheetFeature {
  const m = /\s*\((\d{1,2})\s*\/\s*(short|long)\s*rest\)/i.exec(f.name);
  if (!m || f.uses) return f;
  const max = Number(m[1]);
  if (max < 1) return f;
  return {
    ...f,
    name: f.name.replace(m[0], '').trim().slice(0, 120),
    uses: { max, used: 0, reset: m[2]!.toLowerCase() === 'short' ? 'short' : 'long' },
  };
}

/**
 * A one-line feature: "Disciple of Life: healing spells restore…" is a name and its text, and so
 * is "Magic Initiate (Cleric) – origin feat…"; a short tail ("Fighting Style: Defense") stays
 * part of the name.
 */
function nameAndText(line: string): { name: string; text: string } {
  const m = /^(.{2,60}?)(?::|\s[–—-])\s+(.+)$/.exec(line);
  if (m && m[2]!.length > 30)
    return { name: m[1]!.trim().slice(0, 120), text: m[2]!.slice(0, 20_000) };
  return { name: line.slice(0, 120), text: '' };
}

/** Equipment: the export's `Eq Name0`/`Eq Qty0` rows, or a free-text list split on commas and lines. */
function readEquipment(byKey: Map<string, PdfField>, freeText: string): SheetItem[] {
  const rows = [...byKey.keys()]
    .map((k) => /^eq name(\d+)$/.exec(k))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  const out: SheetItem[] = [];
  for (const n of rows) {
    const name = byKey.get(`eq name${n}`)?.value.trim() ?? '';
    if (!name) continue;
    const qty = firstNumber(byKey.get(`eq qty${n}`)?.value ?? '');
    out.push({ id: ulid(), name: name.slice(0, 120), quantity: clamp(qty ?? 1, 0, 9999) });
  }
  if (out.length || !freeText) return out.slice(0, 500);
  // Split on commas and lines, not inside brackets.
  const pieces: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of freeText) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n')) {
      pieces.push(buf);
      buf = '';
    } else buf += ch;
  }
  pieces.push(buf);
  for (const piece of pieces) {
    const t = piece.trim();
    if (!t) continue;
    const m = /^(\d{1,4})\s*[x×]?\s+(.+)$/i.exec(t);
    out.push({
      id: ulid(),
      name: (m ? m[2]! : t).slice(0, 120),
      quantity: m ? clamp(Number(m[1]), 0, 9999) : 1,
    });
  }
  return out.slice(0, 500);
}

function readNotes(text: (...keys: string[]) => string): string {
  const out: string[] = [];
  for (const [label, keys] of NOTE_FIELDS) {
    const v = text(...keys);
    if (v) out.push(v.includes('\n') ? `${label}:\n${v}` : `${label}: ${v}`);
  }
  return out.join('\n\n').slice(0, 50_000);
}
