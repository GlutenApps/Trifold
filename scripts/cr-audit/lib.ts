/**
 * CR audit library: reads a stat block's offence and defence from its text (2014 and 2024
 * wording), and simulates a fight against a reference party of four.
 */
import { readFileSync } from 'node:fs';

export const CR = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
];
export const XP = [
  10, 25, 50, 100, 200, 450, 700, 1100, 1800, 2300, 2900, 3900, 5000, 5900, 7200, 8400, 10000,
  11500, 13000, 15000, 18000, 20000, 22000, 25000, 33000, 41000, 50000, 62000, 75000, 90000, 105000,
  120000, 135000, 155000,
];
export const crNum = (c: string) => (c.includes('/') ? 1 / Number(c.split('/')[1]) : Number(c));
export const crIdx = (c: string) => CR.indexOf(c);

export interface Feature {
  name: string;
  displayName?: string;
  text: string;
  recharge?: { min: number; max?: number };
  uses?: { count?: number; per?: string };
}
export interface Monster {
  cr: string;
  xp: number;
  proficiencyBonus?: number;
  ac: { value: number; note?: string } | null;
  hp: { average: number; formula?: string } | null;
  saves: Record<string, number>;
  skills: Record<string, number>;
  passivePerception?: number;
  traits: Feature[];
  actions: Feature[];
  bonusActions: Feature[];
  reactions: Feature[];
  legendary: { actions: Feature[] };
  lair: Feature[];
  damageResistances?: string[];
  damageImmunities?: string[];
  spellcasting?: unknown;
  scaled?: { fromCr: string; toCr: string };
}
export interface Rec {
  key: string;
  name: string;
  edition: string;
  data: Monster;
}

export function loadMonsters(path: string, edition: string): Rec[] {
  const out: Rec[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.kind !== 'monster' || !r.data.hp || !r.data.ac || !CR.includes(r.data.cr)) continue;
    out.push({ key: r.key, name: r.name, edition, data: r.data });
  }
  return out;
}

// ---------------- offence ----------------
export interface Attack {
  name: string;
  toHit: number;
  dmg: number;
}
export interface SaveAct {
  name: string;
  dc: number;
  dmg: number;
  half: boolean;
  targets: number;
  recharge: number /* chance per round, 1 = always */;
  once: boolean;
}
export interface Offence {
  attacks: Attack[];
  routine: Attack[]; // what one turn of attacks is (Multiattack or the best attack)
  best: Attack | null; // the best single attack (a horde's attack)
  saves: SaveAct[];
  bonus: Attack | null;
  legendaryUses: number;
  legendaryAttack: Attack | null;
}

const NUMW: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

/** Damage of an attack text: every damage roll on a hit, the two-handed alternative dropped. */
export function damageOf(text: string): number {
  let t = text.replace(
    /,?\s*or\s+\d+\s*\([^)]*\)\s*\w+\s+damage\s+(?:if|when)\s+used\s+with\s+two\s+hands/gi,
    '',
  );
  t = t.replace(/,?\s*or\s+\d+\s*\([^)]*\)\s*\w+\s+damage\s+if\s+used\s+with\s+two\s+hands/gi, '');
  let total = 0;
  let found = false;
  for (const m of t.matchAll(/(\d+)\s*\(\d+d\d+[^)]*\)/g)) {
    total += Number(m[1]);
    found = true;
  }
  if (!found) {
    const f =
      t.match(/(?:Hit:\s*|ft\.\s*|feet\.\s*)(\d+)\s+\w+\s+damage/i) ||
      t.match(
        /\b(\d+)\s+(?:acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage/i,
      );
    if (f) total += Number(f[1]);
  }
  return total;
}

function toHitOf(text: string): number | null {
  const m = text.match(/Attack Roll:\s*([+-]\d+)/) || text.match(/([+-]\d+)\s+to hit/);
  return m ? Number(m[1]) : null;
}

function rechargeOf(name: string, text: string): { p: number; once: boolean } {
  const s = name + ' ' + text.slice(0, 40);
  const r = s.match(/Recharge\s*(\d)(?:\s*[–-]\s*6)?/i);
  if (r) return { p: (7 - Number(r[1])) / 6, once: false };
  if (/\d\/Day/i.test(name)) return { p: 0, once: true };
  return { p: 1, once: false };
}

export function offenceOf(m: Monster): Offence {
  const attacks: Attack[] = [];
  const saves: SaveAct[] = [];
  for (const f of m.actions) {
    if (/^multiattack/i.test(f.name)) continue;
    const hit = toHitOf(f.text);
    const nm = f.displayName ?? f.name;
    if (hit !== null) {
      const d = damageOf(f.text);
      if (d > 0) attacks.push({ name: nm, toHit: hit, dmg: d });
      continue;
    }
    const dc = f.text.match(/DC\s*(\d+)/);
    if (dc) {
      let d = 0;
      for (const x of f.text.matchAll(/(\d+)\s*\(\d+d\d+[^)]*\)/g)) {
        d = Math.max(d, Number(x[1]));
      }
      if (d > 0) {
        const area =
          /each creature|each target|\d+-foot[- ](?:cone|line|sphere|cube|emanation|radius)|(?:cone|line|sphere|cube|emanation)\b/i.test(
            f.text,
          );
        const rc = f.recharge
          ? { p: (7 - f.recharge.min) / 6, once: false }
          : f.uses?.per === 'day'
            ? { p: 0, once: true }
            : rechargeOf(f.name, f.text);
        saves.push({
          name: nm,
          dc: Number(dc[1]),
          dmg: d,
          half: /half/i.test(f.text),
          targets: area ? 2 : 1,
          recharge: rc.p,
          once: rc.once,
        });
      }
    }
  }
  const best = attacks.reduce<Attack | null>((b, a) => (!b || a.dmg > b.dmg ? a : b), null);
  let routine: Attack[] = best ? [best] : [];
  const multi = m.actions.find((f) => /^multiattack/i.test(f.name));
  if (multi && attacks.length) {
    const t = multi.text;
    const first = t.match(/\b(one|two|three|four|five|six|seven|eight|\d)\b/i);
    const count = first ? (NUMW[first[1]!.toLowerCase()] ?? Number(first[1])) : 2;
    // named attacks: "one Bite attack and two Claw attacks", "two attacks with its claws"
    const named: Attack[] = [];
    for (const a of attacks) {
      const word = a.name.split(/\s+/)[0]!.toLowerCase().replace(/s$/, '');
      if (word.length > 2 && t.toLowerCase().includes(word)) named.push(a);
    }
    const pool = named.length ? named : [best!];
    // per-name counts where written as "<n> <Name>"
    const routineList: Attack[] = [];
    let assigned = 0;
    for (const a of pool) {
      const w = a.name.split(/\s+/)[0]!;
      const re = new RegExp(
        `\\b(one|two|three|four|five|six|a|an|\\d)\\s+(?:\\w+\\s+)?${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      );
      const mm = t.match(re);
      const k = mm ? (NUMW[mm[1]!.toLowerCase()] ?? Number(mm[1])) : 0;
      for (let i = 0; i < k; i++) routineList.push(a);
      assigned += k;
    }
    if (routineList.length === 0 || assigned > count + 2) {
      routine = [];
      const avg = pool.reduce((s, a) => s + a.dmg, 0) / pool.length;
      const hit = pool.reduce((s, a) => s + a.toHit, 0) / pool.length;
      for (let i = 0; i < count; i++) routine.push({ name: 'routine', toHit: hit, dmg: avg });
    } else {
      routine = routineList;
      // "makes three attacks: two with X" — fill the rest with the best
      while (routine.length < count) routine.push(best!);
    }
  }
  let bonus: Attack | null = null;
  for (const f of m.bonusActions) {
    const hit = toHitOf(f.text);
    if (hit === null) continue;
    const d = damageOf(f.text);
    if (d > 0 && (!bonus || d > bonus.dmg)) bonus = { name: f.name, toHit: hit, dmg: d };
  }
  let legendaryUses = 0;
  let legendaryAttack: Attack | null = null;
  if (m.legendary.actions.length) {
    const all = [...m.traits, ...m.actions].map((f) => f.text).join(' ');
    const u =
      all.match(/(?:can take|Legendary Action Uses:)\s*(\d)/i) ||
      (m as unknown as { legendary: { intro?: string } }).legendary.intro?.match(/(\d)/);
    const per = (m.legendary as { perTurn?: number }).perTurn;
    legendaryUses = per ?? (u ? Number(u[1]) : 3);
    for (const f of m.legendary.actions) {
      const hit = toHitOf(f.text);
      let a: Attack | null = null;
      if (hit !== null) {
        const d = damageOf(f.text);
        if (d > 0) a = { name: f.name, toHit: hit, dmg: d };
      } else {
        // "makes one Tail attack" / "uses Rend"
        const ref = attacks.find((x) =>
          f.text.toLowerCase().includes(x.name.split(/\s+/)[0]!.toLowerCase()),
        );
        if (ref) a = ref;
      }
      const cost = /costs?\s*(\d)/i.exec(f.name + f.text)?.[1];
      if (a && (!cost || cost === '1') && (!legendaryAttack || a.dmg > legendaryAttack.dmg))
        legendaryAttack = a;
    }
  }
  return { attacks, routine, best, saves, bonus, legendaryUses, legendaryAttack };
}

/** Highest save DC in the stat block, or null. */
export function maxDc(m: Monster): number | null {
  let best: number | null = null;
  for (const f of [
    ...m.traits,
    ...m.actions,
    ...m.bonusActions,
    ...m.reactions,
    ...m.legendary.actions,
  ]) {
    for (const x of f.text.matchAll(/DC\s*(\d+)/g)) best = Math.max(best ?? 0, Number(x[1]));
  }
  return best;
}

/** Damage the routine deals on average per round if everything hits (for stat comparisons). */
export function rawDpr(o: Offence): number {
  const r = o.routine.reduce((s, a) => s + a.dmg, 0) + (o.bonus?.dmg ?? 0);
  const save = o.saves
    .filter((s) => !s.once)
    .reduce((b, s) => Math.max(b, s.dmg * s.targets * (s.recharge === 1 ? 1 : 0.5)), 0);
  const leg = o.legendaryAttack ? o.legendaryAttack.dmg * o.legendaryUses * 0.5 : 0;
  return Math.max(r, save) + leg;
}

// ---------------- party ----------------
export interface Party {
  level: number;
  hp: number;
  ac: number;
  toHit: number;
  save: number;
  dmg: number;
  size: number;
}
export function partyFor(level: number): Party {
  const L = Math.max(1, Math.min(20, level));
  const prof = 2 + Math.floor((L - 1) / 4);
  const mod = L < 4 ? 3 : L < 8 ? 4 : 5;
  return {
    level: L,
    hp: 7 * L + 3,
    ac: L < 5 ? 15 : L < 9 ? 16 : L < 13 ? 17 : L < 17 ? 18 : 19,
    toHit: prof + mod,
    save: 1 + Math.floor(prof / 2) + 1,
    // damage on a hit per PC per round: one attack at 1st, two-attack/cantrip scaling, then feats and spells
    dmg: 7 + 1.7 * L,
    size: 4,
  };
}
/** Party level that meets a CR as a typical single foe. */
export const levelForCr = (c: string) => Math.max(1, Math.min(20, Math.round(crNum(c))));

// ---------------- simulation ----------------
export interface Foe {
  hp: number;
  ac: number;
  offence: Offence;
  resistFactor: number;
  horde?: { size: number; memberHp: number };
}

export function resistFactor(m: Monster): number {
  const imm = (m.damageImmunities ?? []).join(' ').toLowerCase();
  const res = (m.damageResistances ?? []).join(' ').toLowerCase();
  const bps = (s: string) => /bludgeoning/.test(s) && /piercing/.test(s) && /slashing/.test(s);
  if (bps(imm)) return 0.5;
  if (bps(res)) return 0.75;
  const n =
    (res.match(/acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder/g) ?? [])
      .length +
    2 *
      (imm.match(/acid|cold|fire|force|lightning|necrotic|psychic|radiant|thunder/g) ?? []).length;
  return Math.max(0.8, 1 - 0.03 * n);
}

export function foeOf(m: Monster, horde?: number): Foe {
  const offence = offenceOf(m);
  const hp = m.hp!.average;
  return horde
    ? {
        hp: hp * horde,
        ac: m.ac!.value,
        offence,
        resistFactor: resistFactor(m),
        horde: { size: horde, memberHp: hp },
      }
    : { hp, ac: m.ac!.value, offence, resistFactor: resistFactor(m) };
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FightStats {
  taken: number;
  rounds: number;
  drop: number;
  spike: number;
  partyWin: number;
}

/**
 * One foe (or a horde) against the party, `runs` times. `taken` is the share of the party's hit
 * points lost, `rounds` how long the foe lasted, `drop` the chance a PC hits 0, `spike` the largest
 * single hit as a share of one PC's hit points.
 */
export function fight(foes: Foe[], party: Party, runs: number, seed = 1): FightStats {
  const rand = rng(seed);
  const d20 = () => 1 + Math.floor(rand() * 20);
  let taken = 0,
    rounds = 0,
    drop = 0,
    spike = 0,
    win = 0;
  for (let r = 0; r < runs; r++) {
    const pcs = Array.from({ length: party.size }, () => party.hp);
    const fhp = foes.map((f) => f.hp);
    const charged = foes.map((f) => f.offence.saves.map(() => true));
    let round = 0;
    let dropped = false;
    let maxHit = 0;
    const monsterFirst = rand() < 0.5;
    const partyTurn = () => {
      for (let i = 0; i < party.size; i++) {
        if (pcs[i]! <= 0) continue;
        const target = fhp.findIndex((h) => h > 0);
        if (target < 0) return;
        const f = foes[target]!;
        const roll = d20();
        if (roll === 1) continue;
        if (roll === 20 || roll + party.toHit >= f.ac) {
          const dmg = party.dmg * (roll === 20 ? 1.5 : 1) * f.resistFactor;
          fhp[target]! -= dmg;
        }
      }
    };
    const hitPc = (dmg: number) => {
      const alive = pcs.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
      if (!alive.length) return;
      const i = alive[Math.floor(rand() * alive.length)]!;
      pcs[i]! -= dmg;
      maxHit = Math.max(maxHit, dmg);
      if (pcs[i]! <= 0) {
        dropped = true;
      }
    };
    const attack = (a: Attack, mult: number) => {
      const roll = d20();
      if (roll === 1) return;
      if (roll === 20) {
        hitPc(a.dmg * mult * 1.5);
        return;
      }
      if (roll + a.toHit >= party.ac) hitPc(a.dmg * mult);
    };
    const foeTurn = () => {
      foes.forEach((f, k) => {
        if (fhp[k]! <= 0) return;
        const o = f.offence;
        const mult = f.horde ? Math.min(f.horde.size, Math.ceil(fhp[k]! / f.horde.memberHp)) : 1;
        // recharge rolls
        o.saves.forEach((s, j) => {
          if (!charged[k]![j] && !s.once && s.recharge < 1 && rand() < s.recharge)
            charged[k]![j] = true;
        });
        // expected value of routine vs best save action
        const pHit = (a: Attack) =>
          Math.min(0.95, Math.max(0.05, (21 - (party.ac - a.toHit)) / 20));
        const routineEv = f.horde
          ? o.best
            ? o.best.dmg * mult * pHit(o.best)
            : 0
          : o.routine.reduce((s, a) => s + a.dmg * pHit(a), 0);
        let bestSave = -1,
          bestSaveEv = 0;
        if (!f.horde) {
          o.saves.forEach((s, j) => {
            if (!charged[k]![j]) return;
            const fail = Math.min(0.95, Math.max(0.05, (s.dc - party.save - 1) / 20));
            const ev = s.dmg * s.targets * (fail + (s.half ? (1 - fail) / 2 : 0));
            if (ev > bestSaveEv) {
              bestSaveEv = ev;
              bestSave = j;
            }
          });
        }
        if (bestSave >= 0 && bestSaveEv > routineEv) {
          const s = o.saves[bestSave]!;
          charged[k]![bestSave] = false;
          const alive = pcs.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
          for (let t = 0; t < Math.min(s.targets, alive.length); t++) {
            const fail = d20() + party.save < s.dc;
            const dmg = fail ? s.dmg : s.half ? s.dmg / 2 : 0;
            if (dmg > 0) {
              const i = alive[t]!;
              pcs[i]! -= dmg;
              maxHit = Math.max(maxHit, dmg);
              if (pcs[i]! <= 0) dropped = true;
            }
          }
        } else if (f.horde) {
          if (o.best) attack(o.best, mult);
        } else {
          for (const a of o.routine) attack(a, 1);
        }
        if (!f.horde && o.bonus) attack(o.bonus, 1);
        // legendary actions: half of them spent on the cheapest attack, after PCs' turns
        if (!f.horde && o.legendaryAttack)
          for (let u = 0; u < o.legendaryUses; u++) if (rand() < 0.5) attack(o.legendaryAttack, 1);
      });
    };
    while (round < 12 && fhp.some((h) => h > 0) && pcs.some((h) => h > 0)) {
      round++;
      if (monsterFirst) {
        foeTurn();
        partyTurn();
      } else {
        partyTurn();
        foeTurn();
      }
    }
    const lost = pcs.reduce((s, h) => s + (party.hp - Math.max(0, h)), 0);
    taken += lost / (party.hp * party.size);
    rounds += round;
    if (dropped) drop++;
    spike += maxHit / party.hp;
    if (fhp.every((h) => h <= 0)) win++;
  }
  return {
    taken: taken / runs,
    rounds: rounds / runs,
    drop: drop / runs,
    spike: spike / runs,
    partyWin: win / runs,
  };
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const h = s.length / 2;
  return s.length % 2 ? s[Math.floor(h)]! : (s[h - 1]! + s[h]!) / 2;
};
export const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const p = (s.length - 1) * q;
  const lo = Math.floor(p);
  return s[lo]! + (s[Math.min(s.length - 1, lo + 1)]! - s[lo]!) * (p - lo);
};
export const pctRank = (xs: number[], v: number) =>
  xs.filter((x) => x < v).length / xs.length + xs.filter((x) => x === v).length / (2 * xs.length);
