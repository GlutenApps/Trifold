import { crToNumber, normalizeCr, proficiencyBonusForCr, xpForCr } from './tables';

/**
 * The CR scaler (DESIGN.md §6.2, Beta 8, ADR 0038): a monster moved to another CR by shifting
 * each number by how much the typical value moves between the two CRs, so a monster keeps its
 * shape (a tough, slow hitter stays one). AC, attack bonuses and save DCs shift by a difference;
 * HP and damage scale by a ratio, rewritten as dice of the same size; saving throws and skills
 * follow the proficiency bonus. Ability scores, speeds, senses, spells and other text stay.
 *
 * The typical values are straight lines fitted to the bundled SRD 5.2 monsters (331 of them);
 * they match published analyses of the 2024 Monster Manual. Above CR 20 HP and damage climb
 * faster, as both show.
 */
export const CR_BASELINE = {
  ac: (cr: number) => 12.4 + 0.42 * cr,
  attack: (cr: number) => 3.8 + 0.53 * cr,
  dc: (cr: number) => 11.2 + 0.52 * cr,
  hp: (cr: number) => (cr <= 20 ? 15 * (cr + 1) : 315 + 41 * (cr - 20)),
  damage: (cr: number) => (cr <= 20 ? 6 * (cr + 1) : 126 + 12 * (cr - 20)),
};

/** The parts of a stat block the scaler can change; the DM can leave any of them out. */
export type ScalePart = 'hp' | 'ac' | 'attack' | 'dc' | 'damage' | 'proficiency' | 'attacks';
export const SCALE_PARTS: readonly ScalePart[] = [
  'hp',
  'ac',
  'attack',
  'dc',
  'damage',
  'proficiency',
];

export interface ScalableFeature {
  name: string;
  displayName?: string;
  text: string;
}

/** The fields the scaler reads and writes; a monster record's data fits it. */
export interface ScalableMonster {
  cr: string;
  xp: number;
  proficiencyBonus?: number;
  ac: { value: number; note?: string } | null;
  hp: { average: number; formula?: string } | null;
  saves: Partial<Record<string, number>>;
  skills: Record<string, number>;
  passivePerception?: number;
  traits: ScalableFeature[];
  actions: ScalableFeature[];
  bonusActions: ScalableFeature[];
  reactions: ScalableFeature[];
  legendary: { actions: ScalableFeature[] };
  lair: ScalableFeature[];
  spellcasting?: unknown;
  /** Scaled from `fromCr` (the CR it was first written at) to `toCr` (ADR 0038). */
  scaled?: { fromCr: string; toCr: string };
}

/** One "old → new" line of the preview. */
export interface ScaleLine {
  part: ScalePart | 'cr';
  label: string;
  from: string;
  to: string;
}

export interface ScaleResult<M> {
  monster: M;
  lines: ScaleLine[];
  /** What the scaler left alone that may want a look. */
  notes: string[];
  /** Whether a Multiattack change is on offer: one more attack going up, one fewer going down. */
  attackOffer: 'add' | 'remove' | null;
}

/** CR difference at which one more (or one fewer) attack is offered. */
export const ATTACK_OFFER_STEP = 4;

const FEATURE_LISTS = ['traits', 'actions', 'bonusActions', 'reactions', 'lair'] as const;
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** "27 (5d8 + 5)" or "27 (5d8+5)": the same spacing as the text it replaces. */
function diceText(count: number, die: number, mod: number, spaced: boolean): string {
  if (mod === 0) return `${count}d${die}`;
  const sign = mod > 0 ? '+' : '-';
  return spaced
    ? `${count}d${die} ${sign} ${Math.abs(mod)}`
    : `${count}d${die}${sign}${Math.abs(mod)}`;
}

/**
 * A damage roll scaled to `ratio` of its average, the die size kept: the modifier moves with
 * the ability score (`modShift`) and the dice make up the rest.
 */
export function scaleDamageRoll(
  count: number,
  die: number,
  mod: number | null,
  ratio: number,
  modShift: number,
): { count: number; mod: number; average: number } {
  const perDie = (die + 1) / 2;
  const before = count * perDie + (mod ?? 0);
  const target = before * ratio;
  const nextMod = mod === null ? 0 : mod + modShift;
  const nextCount = Math.max(1, Math.round((target - nextMod) / perDie));
  return {
    count: nextCount,
    mod: nextMod,
    average: Math.max(1, Math.floor(nextCount * perDie + nextMod)),
  };
}

const DAMAGE_ROLL = /(\d+)\s*\((\d+)d(\d+)(\s*([+-])\s*(\d+))?\)/g;
const HAS_DAMAGE_ROLL = /\d+\s*\(\d+d\d+/;
const ATTACK_ROLL_2024 = /(Attack Roll:\s*)([+-]\d+)/g;
const ATTACK_ROLL_2014 = /([+-]\d+)(\s+to hit)/g;
const SAVE_DC = /\bDC\s*(\d+)/g;

interface TextChanges {
  text: string;
  attacks: Array<{ from: number; to: number }>;
  dcs: Array<{ from: number; to: number }>;
  damage: Array<{ from: string; to: string }>;
}

function scaleText(
  text: string,
  parts: ReadonlySet<ScalePart>,
  shift: { attack: number; dc: number; mod: number },
  damageRatio: number,
): TextChanges {
  const out: TextChanges = { text, attacks: [], dcs: [], damage: [] };
  if (parts.has('attack') && shift.attack !== 0) {
    out.text = out.text
      .replace(ATTACK_ROLL_2024, (_m, head: string, n: string) => {
        const to = Number(n) + shift.attack;
        out.attacks.push({ from: Number(n), to });
        return `${head}${signed(to)}`;
      })
      .replace(ATTACK_ROLL_2014, (_m, n: string, tail: string) => {
        const to = Number(n) + shift.attack;
        out.attacks.push({ from: Number(n), to });
        return `${signed(to)}${tail}`;
      });
  }
  if (parts.has('dc') && shift.dc !== 0) {
    out.text = out.text.replace(SAVE_DC, (_m, n: string) => {
      const to = Math.max(1, Number(n) + shift.dc);
      out.dcs.push({ from: Number(n), to });
      return `DC ${to}`;
    });
  }
  if (parts.has('damage') && damageRatio !== 1) {
    out.text = out.text.replace(
      DAMAGE_ROLL,
      (whole, _avg: string, n: string, d: string, modPart?: string, sign?: string, k?: string) => {
        const mod = modPart ? (sign === '-' ? -1 : 1) * Number(k) : null;
        const next = scaleDamageRoll(Number(n), Number(d), mod, damageRatio, shift.mod);
        const spaced = !!modPart && /\s/.test(modPart);
        const to = `${next.average} (${diceText(next.count, Number(d), next.mod, spaced)})`;
        out.damage.push({ from: whole, to });
        return to;
      },
    );
  }
  return out;
}

/** The number of attacks a Multiattack text names ("makes two Scimitar attacks"), or null. */
export function multiattackCount(text: string): number | null {
  const m = /\b(one|two|three|four|five|six|seven|eight|\d)\b/i.exec(text);
  if (!m?.[1]) return null;
  const word = m[1].toLowerCase();
  const n = /\d/.test(word) ? Number(word) : NUMBER_WORDS.indexOf(word) + 1;
  return n > 0 ? n : null;
}

function withAttackCount(text: string, count: number): string {
  return text.replace(/\b(one|two|three|four|five|six|seven|eight|\d)\b/i, (w) => {
    const word = NUMBER_WORDS[count - 1] ?? String(count);
    return /^[A-Z]/.test(w) ? word[0]!.toUpperCase() + word.slice(1) : word;
  });
}

const isMultiattack = (f: ScalableFeature) => /^multiattack/i.test(f.name.trim());
const hasAttackRoll = (f: ScalableFeature) =>
  /Attack Roll:|Weapon Attack:|Spell Attack:/i.test(f.text);

/**
 * Scales a monster to `toCr`, applying only `parts` (the CR, XP and proficiency bonus always
 * move). `name` words a new Multiattack. Returns the scaled copy, the preview lines for what
 * was applied, notes on what was left alone, and whether a Multiattack change is on offer.
 */
export function scaleCr<M extends ScalableMonster>(
  monster: M,
  toCr: string,
  parts: ReadonlySet<ScalePart>,
  name = 'creature',
): ScaleResult<M> {
  const to = normalizeCr(toCr);
  const fromNum = crToNumber(monster.cr);
  const toNum = crToNumber(to);
  if (to === null || fromNum === null || toNum === null) {
    return { monster, lines: [], notes: [], attackOffer: null };
  }
  const lines: ScaleLine[] = [];
  const notes: string[] = [];
  const pbFrom = monster.proficiencyBonus ?? proficiencyBonusForCr(monster.cr) ?? 2;
  const pbTo = proficiencyBonusForCr(to) ?? pbFrom;
  const pbDelta = pbTo - pbFrom;
  const diff = (key: 'ac' | 'attack' | 'dc') =>
    Math.round(CR_BASELINE[key](toNum) - CR_BASELINE[key](fromNum));
  const ratio = (key: 'hp' | 'damage') => CR_BASELINE[key](toNum) / CR_BASELINE[key](fromNum);
  const shift = { attack: diff('attack'), dc: diff('dc'), mod: diff('attack') - pbDelta };

  const next: M = { ...monster };
  const xpTo = xpForCr(to) ?? monster.xp;
  lines.push({
    part: 'cr',
    label: 'Challenge',
    from: `${monster.cr} (${monster.xp.toLocaleString('en-US')} XP)`,
    to: `${to} (${xpTo.toLocaleString('en-US')} XP)`,
  });
  next.cr = to;
  next.xp = xpTo;
  next.proficiencyBonus = pbTo;
  const fromCr = monster.scaled?.fromCr ?? monster.cr;
  if (fromCr === to) delete next.scaled;
  else next.scaled = { fromCr, toCr: to };

  // Hit points: the same die size, the Constitution bonus per die kept.
  if (parts.has('hp') && monster.hp) {
    const target = monster.hp.average * ratio('hp');
    const m = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(monster.hp.formula ?? '');
    let hp: { average: number; formula?: string };
    if (m) {
      const count = Number(m[1]);
      const die = Number(m[2]);
      const bonus = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
      const perDie = bonus / count;
      const nextCount = Math.max(1, Math.round(target / ((die + 1) / 2 + perDie)));
      const nextBonus = Math.round(nextCount * perDie);
      const spaced = /\s[+-]\s/.test(monster.hp.formula ?? '');
      hp = {
        average: Math.max(1, Math.floor((nextCount * (die + 1)) / 2) + nextBonus),
        formula: diceText(nextCount, die, nextBonus, spaced),
      };
    } else {
      hp = { average: Math.max(1, Math.round(target)) };
    }
    if (hp.average !== monster.hp.average) {
      const show = (h: { average: number; formula?: string }) =>
        h.formula ? `${h.average} (${h.formula})` : `${h.average}`;
      lines.push({ part: 'hp', label: 'Hit points', from: show(monster.hp), to: show(hp) });
      next.hp = hp;
    }
  }

  const acShift = diff('ac');
  if (parts.has('ac') && monster.ac && acShift !== 0) {
    const value = Math.max(1, monster.ac.value + acShift);
    lines.push({ part: 'ac', label: 'Armor class', from: `${monster.ac.value}`, to: `${value}` });
    next.ac = { ...monster.ac, value };
  }

  // Multiattack: one more attack at a big step up, one fewer at a big step down.
  const actions = monster.actions;
  const multi = actions.find(isMultiattack);
  const attackers = actions.filter((f) => !isMultiattack(f) && hasAttackRoll(f));
  const count = multi ? (multiattackCount(multi.text) ?? 1) : 1;
  const step = toNum - fromNum;
  const attackOffer: 'add' | 'remove' | null =
    step >= ATTACK_OFFER_STEP && count < NUMBER_WORDS.length && (multi || attackers.length > 0)
      ? 'add'
      : step <= -ATTACK_OFFER_STEP && multi && count >= 2
        ? 'remove'
        : null;
  let attacksAfter = count;
  let nextActions = actions;
  if (attackOffer && parts.has('attacks')) {
    attacksAfter = attackOffer === 'add' ? count + 1 : count - 1;
    const words = (n: number) => `${NUMBER_WORDS[n - 1] ?? n} attack${n === 1 ? '' : 's'}`;
    if (multi && attacksAfter >= 2) {
      nextActions = actions.map((f) =>
        f === multi ? { ...f, text: withAttackCount(f.text, attacksAfter) } : f,
      );
    } else if (multi) {
      nextActions = actions.filter((f) => f !== multi);
    } else {
      const first = attackers[0]!;
      const added: ScalableFeature = {
        name: 'Multiattack',
        displayName: 'Multiattack',
        text: `The ${name.toLowerCase()} makes two ${first.displayName ?? first.name} attacks.`,
      };
      nextActions = [added, ...actions];
    }
    lines.push({
      part: 'attacks',
      label: 'Multiattack',
      from: multi ? words(count) : 'one attack',
      to: attacksAfter >= 2 ? words(attacksAfter) : 'one attack',
    });
  }

  // Damage per round scales; with an attack more or fewer, each attack roll carries its share.
  // Save effects such as a breath weapon are not part of the Multiattack and scale as they are.
  const damageRatio = ratio('damage');
  const attackRatio = damageRatio * (count / attacksAfter);
  const changed: TextChanges[] = [];
  const scaleList = (list: ScalableFeature[]) =>
    list.map((f) => {
      const c = scaleText(f.text, parts, shift, hasAttackRoll(f) ? attackRatio : damageRatio);
      changed.push(c);
      if (c.damage.length > 0) {
        lines.push({
          part: 'damage',
          label: f.displayName ?? f.name,
          from: c.damage.map((x) => x.from).join(', '),
          to: c.damage.map((x) => x.to).join(', '),
        });
      }
      return c.text === f.text ? f : { ...f, text: c.text };
    });
  for (const key of FEATURE_LISTS) {
    (next as ScalableMonster)[key] = scaleList(key === 'actions' ? nextActions : monster[key]);
  }
  next.legendary = { ...monster.legendary, actions: scaleList(monster.legendary.actions) };

  const attacks = changed.flatMap((c) => c.attacks);
  if (attacks.length > 0) {
    lines.push({
      part: 'attack',
      label: `Attack bonus (${attacks.length})`,
      from: signed(attacks[0]!.from),
      to: signed(attacks[0]!.to),
    });
  }
  const dcs = changed.flatMap((c) => c.dcs);
  if (dcs.length > 0) {
    lines.push({
      part: 'dc',
      label: `Save DC (${dcs.length})`,
      from: `DC ${dcs[0]!.from}`,
      to: `DC ${dcs[0]!.to}`,
    });
  }

  // Saving throws and skills follow the proficiency bonus.
  if (parts.has('proficiency') && pbDelta !== 0) {
    const bump = (r: Partial<Record<string, number>>) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? 0) + pbDelta]));
    next.saves = bump(monster.saves);
    next.skills = bump(monster.skills) as Record<string, number>;
    const perception = Object.keys(monster.skills).some((k) => /^perception$/i.test(k));
    if (perception && monster.passivePerception !== undefined) {
      next.passivePerception = monster.passivePerception + pbDelta;
    }
    lines.push({
      part: 'proficiency',
      label: 'Saving throws and skills',
      from: `proficiency ${signed(pbFrom)}`,
      to: `proficiency ${signed(pbTo)}`,
    });
  }

  notes.push('Ability scores, speeds, senses and other feature text stay as they are.');
  if (monster.spellcasting) {
    notes.push('Its spells stay the same; their save DC and attack bonus move with the others.');
  }
  const all = [...FEATURE_LISTS.flatMap((k) => monster[k]), ...monster.legendary.actions];
  if (all.some((f) => /legendary resistance/i.test(f.name))) {
    notes.push('Legendary Resistance uses stay the same.');
  }
  if (all.some((f) => /regain/i.test(f.text) && !HAS_DAMAGE_ROLL.test(f.text))) {
    notes.push('Fixed numbers in text, like hit points regained, stay the same.');
  }
  return { monster: next, lines, notes, attackOffer };
}
