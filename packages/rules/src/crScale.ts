import { CR_ORDER, crToNumber, normalizeCr, proficiencyBonusForCr, xpForCr } from './tables';

/**
 * The CR scaler (DESIGN.md §6.2, Beta 8, ADR 0038, ADR 0051): a monster moved to another CR by
 * shifting each number by how much the typical value moves between the two CRs. AC, attack
 * bonuses and save DCs shift by a difference; HP and damage scale by a ratio, rewritten as dice of
 * the same size; saving throws and skills follow the proficiency bonus. A small step keeps the
 * monster's shape (a tough, slow hitter stays one); a big step pulls odd numbers part of the way
 * toward the typical ones, so a 1-HP rat does not become a paper-thin CR 10. Ability scores,
 * speeds, senses, spells and other text stay.
 *
 * The typical values are straight lines fitted to the bundled SRD 5.2 monsters (331 of them),
 * with the real values below CR 1, where the lines are far too high (a CR 0 creature has about
 * 4 HP, not 15). Above CR 20 HP and damage climb faster. The 2026-11 fight-simulation audit
 * (`scripts/cr-audit/`) checks that a scaled monster fights like a real one of its new CR.
 */
const LINEAR = {
  hp: (cr: number) => (cr <= 20 ? 15 * (cr + 1) : 315 + 41 * (cr - 20)),
  damage: (cr: number) => (cr <= 20 ? 6 * (cr + 1) : 126 + 12 * (cr - 20)),
};
/** Typical HP and damage per round below CR 1 (SRD 5.2 medians), meeting the lines at CR 1. */
const LOW_END = {
  hp: [
    [0, 4],
    [0.125, 9],
    [0.25, 13],
    [0.5, 20],
    [1, 30],
  ],
  damage: [
    [0, 2],
    [0.125, 4],
    [0.25, 6],
    [0.5, 8],
    [1, 12],
  ],
} as const;
function lowEnd(key: 'hp' | 'damage', cr: number): number {
  const t = LOW_END[key];
  for (let i = 0; i < t.length - 1; i++) {
    const [a, va] = t[i]!;
    const [b, vb] = t[i + 1]!;
    if (cr <= b) return va + ((vb - va) * (Math.max(cr, a) - a)) / (b - a);
  }
  return t[t.length - 1]![1];
}

export const CR_BASELINE = {
  ac: (cr: number) => 12.4 + 0.42 * cr,
  attack: (cr: number) => 3.8 + 0.53 * cr,
  dc: (cr: number) => 11.2 + 0.52 * cr,
  hp: (cr: number) => (cr < 1 ? lowEnd('hp', cr) : LINEAR.hp(cr)),
  damage: (cr: number) => (cr < 1 ? lowEnd('damage', cr) : LINEAR.damage(cr)),
};

/** How many attacks a typical monster of a CR makes in a turn (SRD 5.2). */
export function typicalAttacks(cr: number): number {
  return cr < 3 ? 1 : cr <= 10 ? 2 : 3;
}

/**
 * The parts of a stat block the scaler can change; the DM can leave any of them out, and the CR
 * follows what is applied (ADR 0048). `attacks` changes the Multiattack to a typical count for
 * the new CR; `legendary` adds legendary actions going up past CR 10 (and Legendary Resistance
 * from CR 16) or takes them away going below it; `area` adds an area attack going up past CR 10.
 */
export type ScalePart =
  'hp' | 'ac' | 'attack' | 'dc' | 'damage' | 'proficiency' | 'attacks' | 'legendary' | 'area';
export const SCALE_PARTS: readonly ScalePart[] = [
  'hp',
  'ac',
  'attack',
  'dc',
  'damage',
  'proficiency',
  'attacks',
  'legendary',
  'area',
];
/** The parts that sit at a CR of their own in a tune plan. */
export type LevelPart = 'hp' | 'ac' | 'attack' | 'dc' | 'damage' | 'proficiency';
export const LEVEL_PARTS: readonly LevelPart[] = [
  'hp',
  'ac',
  'damage',
  'attack',
  'dc',
  'proficiency',
];

/**
 * How much each part weighs in the CR the scaled monster ends at (ADR 0048): defence is hit
 * points and armor class, offence damage per round and accuracy, with hit points and damage
 * weighing most, as in the DMG's own CR method. Proficiency moves saves and skills only.
 */
export const CR_WEIGHTS = { hp: 0.35, ac: 0.15, damage: 0.35, attack: 0.075, dc: 0.075 } as const;

/**
 * The extras share the damage budget, as real monsters' do (ADR 0051): the audit found a monster
 * scaled past CR 10 already fights like its CR on its attacks alone, so added legendary actions
 * take their share out of each attack and an area attack trades evenly with a turn of attacks.
 * Added legendary actions count as this many attacks a round (a Strike on about half the uses,
 * as the audit models every monster's legendary actions).
 */
export const LEGENDARY_ATTACKS = 1.5;
/**
 * Steps on the CR list a monster scaled below CR 10 gains by keeping its legendary actions
 * (the audit: about half a step).
 */
export const KEPT_LEGENDARY_STEPS = 0.5;
/** CR at and above which scaling up offers legendary actions and an area attack. */
export const LEGENDARY_FROM = 11;
/** CR below which scaling down takes legendary actions away. */
export const LEGENDARY_BELOW = 10;
/** CR at and above which added legendary actions come with Legendary Resistance. */
export const RESISTANCE_FROM = 16;
/**
 * An added area attack's damage to each creature caught, as a share of the CR's typical damage
 * per round: catching two or three, it is worth about one turn of attacks.
 */
export const AREA_SHARE = 0.5;

/** The CR (as a number) whose typical value of `key` is `value`: the baseline's inverse. */
function crForValue(key: 'hp' | 'damage', value: number): number {
  const f = CR_BASELINE[key];
  if (value <= f(0)) return 0;
  if (value <= f(1)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < value) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  return key === 'damage'
    ? value <= 126
      ? value / 6 - 1
      : 20 + (value - 126) / 12
    : value <= 315
      ? value / 15 - 1
      : 20 + (value - 315) / 41;
}

/** The listed CR nearest a number, the lower one on a tie. */
export function nearestCr(value: number): string {
  let best: string = CR_ORDER[0]!;
  let gap = Infinity;
  for (const cr of CR_ORDER) {
    const d = Math.abs((crToNumber(cr) ?? 0) - value);
    if (d < gap - 1e-9) {
      best = cr;
      gap = d;
    }
  }
  return best;
}

const CR_NUMBERS = CR_ORDER.map((c) => crToNumber(c) ?? 0);
/** A CR number as a (fractional) position on the CR list. */
function rungOf(value: number): number {
  if (value <= 0) return 0;
  for (let i = 0; i < CR_NUMBERS.length - 1; i++) {
    const a = CR_NUMBERS[i]!;
    const b = CR_NUMBERS[i + 1]!;
    if (value <= b) return i + (value - a) / (b - a);
  }
  return CR_NUMBERS.length - 1;
}
/** Steps between two listed CRs. */
const rungsBetween = (a: string, b: string) =>
  Math.abs(CR_ORDER.indexOf(a as never) - CR_ORDER.indexOf(b as never));
/**
 * How much of a monster's own oddity a part keeps when it moves `rungs` steps: all of it at a
 * small step, sliding to 40% at twelve steps or more (the audit's best fit).
 */
const shapeKept = (rungs: number) => Math.max(0.4, 1 - rungs / 12);

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
  legendary: { actions: ScalableFeature[]; perTurn?: number; header?: string };
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

/** What scaling to a CR offers beyond the numbers; each can be left out. */
export interface ScaleOffers {
  /** A typical number of attacks for the new CR: more going up, fewer going down. */
  attacks: 'add' | 'remove' | null;
  /** Legendary actions added going past CR 10, or taken away going below it. */
  legendary: 'add' | 'remove' | null;
  /** An area attack added going past CR 10. */
  area: 'add' | null;
}

export interface ScaleResult<M> {
  monster: M;
  /** The CR the applied parts add up to (ADR 0048); the target when every part is applied. */
  cr: string;
  lines: ScaleLine[];
  /** What the scaler left alone that may want a look. */
  notes: string[];
  offers: ScaleOffers;
}

/**
 * A tune plan (ADR 0051): the CR each part sits at, the attacks per turn and the extras. Quick
 * scale and the scaler's ticks build one from a target CR (`planFor`); Tune mode lets the DM move
 * each part on its own.
 */
export interface TunePlan {
  /** The CR the plan aims at: the extras on offer, and what leaving one out costs, follow it. */
  toCr: string;
  levels: Record<LevelPart, string>;
  /** Attacks per turn (the Multiattack count; 1 is none). */
  attacks: number;
  /** The number of attacks the damage part's damage per round is shared across. */
  spread: number;
  legendary: boolean;
  area: boolean;
}

const FEATURE_LISTS = ['traits', 'actions', 'bonusActions', 'reactions', 'lair'] as const;
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
export const MAX_ATTACKS = NUMBER_WORDS.length;
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const words = (n: number) => `${NUMBER_WORDS[n - 1] ?? n} attack${n === 1 ? '' : 's'}`;

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
const DAMAGE_TYPES =
  'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';
/** Flat damage with no dice ("1 Piercing damage"), which a tiny creature's attacks often deal. */
const FLAT_DAMAGE = new RegExp(`(^|[^\\d)(])\\b(\\d+) (${DAMAGE_TYPES}) damage`, 'gi');
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
  shift: { attack: number; dc: number; mod: number },
  damageRatio: number,
): TextChanges {
  const out: TextChanges = { text, attacks: [], dcs: [], damage: [] };
  if (shift.attack !== 0) {
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
  if (shift.dc !== 0) {
    out.text = out.text.replace(SAVE_DC, (_m, n: string) => {
      const to = Math.max(1, Number(n) + shift.dc);
      out.dcs.push({ from: Number(n), to });
      return `DC ${to}`;
    });
  }
  if (Math.abs(damageRatio - 1) > 1e-9) {
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
    // Flat damage becomes dice once it is worth rolling: d4s while small, then d6s.
    out.text = out.text.replace(FLAT_DAMAGE, (whole, pre: string, n: string, type: string) => {
      const target = Number(n) * damageRatio;
      if (target < 2) return whole;
      const die = target < 6 ? 4 : 6;
      const count = Math.max(1, Math.round(target / ((die + 1) / 2)));
      const to = `${Math.floor((count * (die + 1)) / 2)} (${count}d${die})`;
      out.damage.push({ from: n, to });
      return `${pre}${to} ${type} damage`;
    });
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
const isLegendaryResistance = (f: ScalableFeature) => /^legendary resistance/i.test(f.name.trim());
const RECHARGE = /recharge/i;
/** A save-for-damage action that recharges or is limited: a breath weapon or the like. */
const isAreaAttack = (f: ScalableFeature & { recharge?: unknown; uses?: unknown }) =>
  /\bDC\s*\d+/.test(f.text) &&
  HAS_DAMAGE_ROLL.test(f.text) &&
  !hasAttackRoll(f) &&
  (!!f.recharge || !!f.uses || RECHARGE.test(f.name) || /\/day/i.test(f.name));

/** The average damage of an attack's hit, every roll counted. */
function hitDamage(text: string): number {
  let total = 0;
  for (const m of text.matchAll(/(\d+)\s*\(\d+d\d+[^)]*\)/g)) total += Number(m[1]);
  if (total === 0) {
    const flat = new RegExp(`\\b(\\d+) (?:${DAMAGE_TYPES}) damage`, 'i').exec(text);
    if (flat) total = Number(flat[1]);
  }
  return total;
}

/** What the scaler reads off a stat block before planning. */
interface Facts {
  fromNum: number;
  multi: ScalableFeature | undefined;
  attackers: ScalableFeature[];
  best: ScalableFeature | undefined;
  count: number;
  hasLegendary: boolean;
  hasArea: boolean;
}
function factsOf(monster: ScalableMonster, fromNum: number): Facts {
  const multi = monster.actions.find(isMultiattack);
  const attackers = monster.actions.filter((f) => !isMultiattack(f) && hasAttackRoll(f));
  const best = attackers.reduce<ScalableFeature | undefined>(
    (b, f) => (!b || hitDamage(f.text) > hitDamage(b.text) ? f : b),
    undefined,
  );
  return {
    fromNum,
    multi,
    attackers,
    best,
    count: multi ? Math.min(MAX_ATTACKS, multiattackCount(multi.text) ?? 1) : 1,
    hasLegendary:
      monster.legendary.actions.length > 0 || monster.traits.some(isLegendaryResistance),
    hasArea: [...monster.actions, ...monster.bonusActions].some(isAreaAttack),
  };
}

function offersFor(facts: Facts, toNum: number): ScaleOffers {
  const step = toNum - facts.fromNum;
  const typical = typicalAttacks(toNum);
  const canAttack = !!facts.multi || facts.attackers.length > 0;
  // The extras come at the jump into the legendary band, or at a big step within it.
  const intoBand =
    step > 0 && toNum >= LEGENDARY_FROM && (facts.fromNum < LEGENDARY_FROM || step >= 4);
  return {
    attacks:
      step > 0 && typical > facts.count && canAttack
        ? 'add'
        : step < 0 && facts.multi && typical < facts.count
          ? 'remove'
          : null,
    legendary:
      intoBand && !facts.hasLegendary && facts.best
        ? 'add'
        : step < 0 && toNum < LEGENDARY_BELOW && facts.hasLegendary
          ? 'remove'
          : null,
    area: intoBand && !facts.hasArea && facts.best ? 'add' : null,
  };
}

/**
 * The plan for scaling to `toCr` with only `parts` applied: each ticked part at the target, the
 * others where they are.
 */
export function planFor(
  monster: ScalableMonster,
  toCr: string,
  parts: ReadonlySet<ScalePart>,
): TunePlan | null {
  const to = normalizeCr(toCr);
  const fromNum = crToNumber(monster.cr);
  const toNum = crToNumber(to);
  if (to === null || fromNum === null || toNum === null) return null;
  const facts = factsOf(monster, fromNum);
  const offers = offersFor(facts, toNum);
  const from = normalizeCr(monster.cr) ?? monster.cr;
  const level = (p: LevelPart) => (parts.has(p) ? to : from);
  const planned = offers.attacks ? typicalAttacks(toNum) : facts.count;
  const addLegendary = offers.legendary === 'add' && parts.has('legendary');
  return {
    toCr: to,
    levels: {
      hp: level('hp'),
      ac: level('ac'),
      attack: level('attack'),
      dc: level('dc'),
      damage: level('damage'),
      proficiency: level('proficiency'),
    },
    attacks: offers.attacks && parts.has('attacks') ? planned : facts.count,
    // With an attack change on offer, the damage is shared across the planned attacks; left out,
    // the attacks keep that share, so the damage (and CR) come out lower (ADR 0048). Added
    // legendary actions take their share too (ADR 0051).
    spread: parts.has('damage') ? planned + (addLegendary ? LEGENDARY_ATTACKS : 0) : facts.count,
    legendary:
      offers.legendary === 'add'
        ? addLegendary
        : offers.legendary === 'remove'
          ? !parts.has('legendary')
          : facts.hasLegendary,
    area: offers.area === 'add' && parts.has('area'),
  };
}

/** The plan that changes nothing: every part where it is. */
export function identityPlan(monster: ScalableMonster): TunePlan | null {
  return planFor(monster, monster.cr, new Set());
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
function newFeature(name: string, text: string, displayName = name, extra: object = {}) {
  return { name, displayName, text, tags: [], attacks: [], rolls: [], saves: [], ...extra };
}

/**
 * A monster with every part at the CR the plan gives it (ADR 0051). Returns the copy, the
 * preview lines, notes on what was left alone, the CR the parts add up to and the offers for the
 * plan's target.
 */
export function tuneCr<M extends ScalableMonster>(
  monster: M,
  plan: TunePlan,
  name = 'creature',
): ScaleResult<M> {
  const fromNum = crToNumber(monster.cr);
  const toNum = crToNumber(plan.toCr);
  const empty: ScaleOffers = { attacks: null, legendary: null, area: null };
  if (fromNum === null || toNum === null) {
    return { monster, cr: monster.cr, lines: [], notes: [], offers: empty };
  }
  const from = normalizeCr(monster.cr) ?? monster.cr;
  const facts = factsOf(monster, fromNum);
  const offers = offersFor(facts, toNum);
  const lv = (p: LevelPart) => crToNumber(plan.levels[p]) ?? fromNum;
  const kept = (p: LevelPart) => shapeKept(rungsBetween(from, plan.levels[p]));
  const lines: ScaleLine[] = [{ part: 'cr', label: 'Challenge', from: '', to: '' }];
  const notes: string[] = [];
  const who = name.toLowerCase();

  const pbFrom = monster.proficiencyBonus ?? proficiencyBonusForCr(monster.cr) ?? 2;
  const pbAt = (p: LevelPart) => proficiencyBonusForCr(plan.levels[p]) ?? pbFrom;
  const diff = (key: 'ac' | 'attack' | 'dc') =>
    Math.round(CR_BASELINE[key](lv(key)) - CR_BASELINE[key](fromNum));
  // An attack bonus is proficiency plus an ability modifier; the damage modifier moves with the
  // ability, the part of the bonus the proficiency bonus does not explain.
  const shift = {
    attack: diff('attack'),
    dc: diff('dc'),
    mod: diff('attack') - (pbAt('attack') - pbFrom),
  };

  const next: M = { ...monster };

  // Hit points: the same die size, the Constitution bonus per die kept.
  if (monster.hp && plan.levels.hp !== from) {
    const base = CR_BASELINE.hp(fromNum);
    const target =
      CR_BASELINE.hp(lv('hp')) * Math.pow(Math.max(1, monster.hp.average) / base, kept('hp'));
    const m = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(monster.hp.formula ?? '');
    let hp: { average: number; formula?: string };
    if (m) {
      const count = Number(m[1]);
      const die = Number(m[2]);
      const bonus = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
      // A Constitution penalty (a rat's 1d4 − 1) is dropped going up: 38d4, not 63d4 − 63.
      const perDie = bonus < 0 && target > monster.hp.average ? 0 : bonus / count;
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

  if (monster.ac && plan.levels.ac !== from) {
    const odd = monster.ac.value - CR_BASELINE.ac(fromNum);
    const value = Math.max(1, Math.round(CR_BASELINE.ac(lv('ac')) + odd * kept('ac')));
    if (value !== monster.ac.value) {
      lines.push({
        part: 'ac',
        label: 'Armor class',
        from: `${monster.ac.value}`,
        to: `${value}`,
      });
      next.ac = { ...monster.ac, value };
    }
  }

  // Multiattack: the plan's attacks per turn.
  const attacksAfter = Math.max(1, Math.min(MAX_ATTACKS, Math.round(plan.attacks)));
  let nextActions = monster.actions;
  if (attacksAfter !== facts.count && (facts.multi || facts.best)) {
    if (facts.multi && attacksAfter >= 2) {
      nextActions = monster.actions.map((f) =>
        f === facts.multi ? { ...f, text: withAttackCount(f.text, attacksAfter) } : f,
      );
    } else if (facts.multi) {
      nextActions = monster.actions.filter((f) => f !== facts.multi);
    } else {
      const first = facts.best!;
      const added = newFeature(
        'Multiattack',
        `The ${who} makes ${NUMBER_WORDS[attacksAfter - 1] ?? attacksAfter} ${first.displayName ?? first.name} attacks.`,
      );
      nextActions = [added as ScalableFeature, ...monster.actions];
    }
    lines.push({
      part: 'attacks',
      label: 'Multiattack',
      from: words(facts.count),
      to: words(attacksAfter),
    });
  }

  // Damage per round scales to the damage part's CR, shared across `spread` attacks: each attack
  // is its own roll, so the attacks made set the damage per round (ADR 0048). On a big step an
  // odd damage output is pulled part of the way toward the typical. Save effects such as a
  // breath weapon are not part of the Multiattack and scale as they are.
  const damageRatio = CR_BASELINE.damage(lv('damage')) / CR_BASELINE.damage(fromNum);
  const ownDpr = (facts.best ? hitDamage(facts.best.text) : 0) * facts.count;
  const damageShape =
    ownDpr > 0 ? Math.pow(ownDpr / CR_BASELINE.damage(fromNum), kept('damage') - 1) : 1;
  const spread = Math.max(1, plan.spread);
  const attackRatio = damageRatio * damageShape * (facts.count / spread);
  const changed: TextChanges[] = [];
  const scaleList = (list: ScalableFeature[]) =>
    list.map((f) => {
      const c = scaleText(f.text, shift, hasAttackRoll(f) ? attackRatio : damageRatio);
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

  // Legendary actions: kept and scaled, taken away, or added (ADR 0051).
  const legendaryNow = facts.hasLegendary;
  const addedLegendary = plan.legendary && !legendaryNow && !!facts.best;
  if (plan.legendary && legendaryNow) {
    next.legendary = { ...monster.legendary, actions: scaleList(monster.legendary.actions) };
  } else if (!plan.legendary && legendaryNow) {
    next.legendary = { actions: [] };
    next.traits = next.traits.filter((f) => !isLegendaryResistance(f));
    lines.push({
      part: 'legendary',
      label: 'Legendary actions',
      from:
        monster.legendary.actions.map((f) => f.displayName ?? f.name).join(', ') ||
        'Legendary Resistance',
      to: 'none',
    });
  } else if (plan.legendary && !legendaryNow && facts.best) {
    const attack = facts.best.displayName ?? facts.best.name;
    next.legendary = {
      perTurn: 3,
      header: `Legendary Action Uses: 3. Immediately after another creature's turn, the ${who} can expend a use to take one of the following actions. The ${who} regains all expended uses at the start of each of its turns.`,
      actions: [
        newFeature('Strike', `The ${who} makes one ${attack} attack.`),
        newFeature(
          'Shift',
          `The ${who} moves up to half its Speed without provoking Opportunity Attacks.`,
        ),
      ] as ScalableFeature[],
    };
    let to = 'Strike, Shift (3 a round)';
    if (toNum >= RESISTANCE_FROM && !monster.traits.some(isLegendaryResistance)) {
      next.traits = [
        ...next.traits,
        newFeature(
          'Legendary Resistance (3/Day)',
          `If the ${who} fails a saving throw, it can choose to succeed instead.`,
          'Legendary Resistance',
          { uses: { count: 3, per: 'day' } },
        ) as ScalableFeature,
      ];
      to += '; Legendary Resistance (3/Day)';
    }
    lines.push({ part: 'legendary', label: 'Legendary actions', from: 'none', to });
  } else {
    next.legendary = { ...monster.legendary, actions: scaleList(monster.legendary.actions) };
  }

  // An area attack (ADR 0051): a saving throw in an emanation, the best attack's damage type,
  // the DC of the CR that part sits at, and damage sized to the turn of attacks it stands in for
  // (lower when added legendary actions have taken their share).
  if (plan.area && !facts.hasArea && facts.best) {
    const type = new RegExp(`\\)\\s*(${DAMAGE_TYPES})\\s+damage`, 'i').exec(facts.best.text)?.[1];
    const kind = titleCase(type ?? 'force');
    const dc = Math.round(CR_BASELINE.dc(lv('dc')));
    const turn = CR_BASELINE.damage(lv('damage')) * Math.min(1, attacksAfter / spread);
    const count = Math.max(1, Math.round((turn * AREA_SHARE) / 3.5));
    const roll = `${Math.floor(count * 3.5)} (${count}d6)`;
    const title = `${kind} Burst`;
    const added = newFeature(
      `${title} (Recharge 5–6)`,
      `Dexterity Saving Throw: DC ${dc}, each creature in a 20-foot Emanation originating from the ${who}. Failure: ${roll} ${kind} damage. Success: Half damage.`,
      title,
      { recharge: { min: 5, max: 6 }, saves: [{ ability: 'dex', dc, halfOnSuccess: true }] },
    );
    next.actions = [...next.actions, added as ScalableFeature];
    lines.push({
      part: 'area',
      label: `${title} (Recharge 5–6)`,
      from: 'none',
      to: `DC ${dc}, ${roll} ${kind}`,
    });
  }

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
  const pbDelta = pbAt('proficiency') - pbFrom;
  if (pbDelta !== 0) {
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
      to: `proficiency ${signed(pbFrom + pbDelta)}`,
    });
  }

  notes.push('Ability scores, speeds, senses and other feature text stay as they are.');
  if (monster.spellcasting) {
    notes.push('Its spells stay the same; their save DC and attack bonus move with the others.');
  }
  if (plan.legendary && monster.traits.some(isLegendaryResistance)) {
    notes.push('Legendary Resistance uses stay the same.');
  }
  const all = [...FEATURE_LISTS.flatMap((k) => monster[k]), ...monster.legendary.actions];
  if (all.some((f) => /regain/i.test(f.text) && !HAS_DAMAGE_ROLL.test(f.text))) {
    notes.push('Fixed numbers in text, like hit points regained, stay the same.');
  }

  // The CR the parts add up to (ADR 0048, ADR 0051): each part's CR and damage per round counting
  // the attacks made (added legendary actions among them), blended by the weights; then the
  // monster's own legendary actions kept or dropped against what scaling to the target would do.
  // An added area attack trades evenly with a turn of attacks, so it does not move the CR.
  const strikes = attacksAfter + (addedLegendary ? LEGENDARY_ATTACKS : 0);
  const dprRatio = damageRatio * (strikes / spread);
  const damageCr = crForValue('damage', CR_BASELINE.damage(fromNum) * dprRatio);
  // Blended in steps on the CR list, so below CR 1 a step counts as much as above it.
  const r0 = rungOf(fromNum);
  const moved = (n: number) => rungOf(n) - r0;
  const blend =
    r0 +
    CR_WEIGHTS.hp * moved(lv('hp')) +
    CR_WEIGHTS.ac * moved(lv('ac')) +
    CR_WEIGHTS.damage * moved(damageCr) +
    CR_WEIGHTS.attack * moved(lv('attack')) +
    CR_WEIGHTS.dc * moved(lv('dc'));
  const extraSteps = legendaryNow
    ? KEPT_LEGENDARY_STEPS * (Number(plan.legendary) - Number(offers.legendary !== 'remove'))
    : 0;
  const cr =
    CR_ORDER[Math.max(0, Math.min(CR_ORDER.length - 1, Math.round(blend + extraSteps - 1e-9)))]!;
  const xp = xpForCr(cr) ?? monster.xp;
  lines[0] = {
    part: 'cr',
    label: 'Challenge',
    from: `${monster.cr} (${monster.xp.toLocaleString('en-US')} XP)`,
    to: `${cr} (${xp.toLocaleString('en-US')} XP)`,
  };
  next.cr = cr;
  next.xp = xp;
  next.proficiencyBonus = proficiencyBonusForCr(cr) ?? pbFrom;
  const fromCr = monster.scaled?.fromCr ?? monster.cr;
  if (fromCr === cr) delete next.scaled;
  else next.scaled = { fromCr, toCr: cr };
  return { monster: next, cr, lines, notes, offers };
}

/**
 * Scales a monster to `toCr`, applying only `parts` (the CR, XP and proficiency bonus always
 * move). `name` words a new Multiattack and the added features. Quick scale passes every part.
 */
export function scaleCr<M extends ScalableMonster>(
  monster: M,
  toCr: string,
  parts: ReadonlySet<ScalePart>,
  name = 'creature',
): ScaleResult<M> {
  const plan = planFor(monster, toCr, parts);
  if (!plan) {
    return {
      monster,
      cr: monster.cr,
      lines: [],
      notes: [],
      offers: { attacks: null, legendary: null, area: null },
    };
  }
  return tuneCr(monster, plan, name);
}

/** The CR one step up or down the list from `cr`, held at the ends. */
export function stepCr(cr: string, by: number): string {
  const at = CR_ORDER.indexOf((normalizeCr(cr) ?? cr) as never);
  const from = at >= 0 ? at : by > 0 ? -1 : CR_ORDER.length;
  return CR_ORDER[Math.min(CR_ORDER.length - 1, Math.max(0, from + by))]!;
}

/**
 * Tune mode's Balance (ADR 0051): moves one part to the CR that brings the whole monster
 * closest to the plan's target, the smallest move on a tie; the other parts stay as the DM set
 * them.
 */
export function balancePlan(
  monster: ScalableMonster,
  plan: TunePlan,
  part: LevelPart,
  name = 'creature',
): TunePlan {
  const target = CR_ORDER.indexOf(plan.toCr as never);
  const current = CR_ORDER.indexOf(plan.levels[part] as never);
  let best = plan;
  let gap = Infinity;
  CR_ORDER.forEach((cr, i) => {
    const next = { ...plan, levels: { ...plan.levels, [part]: cr } };
    const off = Math.abs(CR_ORDER.indexOf(tuneCr(monster, next, name).cr as never) - target);
    const score = off * 100 + Math.abs(i - current);
    if (score < gap) {
      gap = score;
      best = next;
    }
  });
  return best;
}

/** What Tune mode can offer for a monster: attacks to step, legendary actions, an area attack. */
export function tuneOptions(monster: ScalableMonster): {
  attacks: number;
  canAttack: boolean;
  hasLegendary: boolean;
  hasArea: boolean;
} {
  const facts = factsOf(monster, crToNumber(monster.cr) ?? 0);
  return {
    attacks: facts.count,
    canAttack: !!facts.best,
    hasLegendary: facts.hasLegendary,
    hasArea: facts.hasArea,
  };
}
