/**
 * Horde trials. Usage: tsx horde.ts <repo root> <out.json>
 * Scenarios: how a horde attacks (one attack x standing | one attack per group of G) and how a
 * party's area damage meets it (none | once on the pool | once per member caught, up to 3).
 * For each: the CR a horde fights like, individuals for comparison, and how it feels.
 */
import { writeFileSync } from 'node:fs';
import {
  CR,
  XP,
  crIdx,
  crNum,
  foeOf,
  levelForCr,
  loadMonsters,
  median,
  offenceOf,
  partyFor,
  rawDpr,
  rng,
  type Attack,
  type Foe,
  type Party,
} from './lib';

type AttackMode = { kind: 'one' } | { kind: 'groups'; g: number };
type Aoe = 'none' | 'once' | 'members';
interface Scenario {
  name: string;
  attack: AttackMode;
  aoe: Aoe;
}
const SCENARIOS: Scenario[] = [
  { name: 'one-noAoE', attack: { kind: 'one' }, aoe: 'none' },
  { name: 'one-aoeOnce', attack: { kind: 'one' }, aoe: 'once' },
  { name: 'one-aoeMembers', attack: { kind: 'one' }, aoe: 'members' },
  { name: 'g4-aoeMembers', attack: { kind: 'groups', g: 4 }, aoe: 'members' },
  { name: 'g3-aoeMembers', attack: { kind: 'groups', g: 3 }, aoe: 'members' },
  { name: 'g4-noAoE', attack: { kind: 'groups', g: 4 }, aoe: 'none' },
];
const RUNS = 160;

interface Stats {
  taken: number;
  rounds: number;
  drop: number;
  spike: number;
}
function fightH(foes: Foe[], party: Party, sc: Scenario, runs: number, seed: number): Stats {
  const rand = rng(seed);
  const d20 = () => 1 + Math.floor(rand() * 20);
  let taken = 0,
    rounds = 0,
    drop = 0,
    spike = 0;
  // from level 3, one PC in four deals area damage (a save spell: ~75% of its damage lands) instead of an attack
  const aoeOn = sc.aoe !== 'none' && party.level >= 3;
  for (let r = 0; r < runs; r++) {
    const pcs = Array.from({ length: party.size }, () => party.hp);
    const fhp = foes.map((f) => f.hp);
    const charged = foes.map((f) => f.offence.saves.map(() => true));
    let round = 0,
      dropped = false,
      maxHit = 0;
    const monsterFirst = rand() < 0.5;
    const partyTurn = () => {
      for (let i = 0; i < party.size; i++) {
        if (pcs[i]! <= 0) continue;
        if (aoeOn && i === 0) {
          const dmg = party.dmg * 0.75;
          // individuals: up to 3 creatures caught; a horde: once, or once per member caught
          let caught = 0;
          for (let k = 0; k < fhp.length && caught < 3; k++) {
            if (fhp[k]! <= 0) continue;
            const f = foes[k]!;
            if (f.horde) {
              const standing = Math.min(f.horde.size, Math.ceil(fhp[k]! / f.horde.memberHp));
              const times = sc.aoe === 'members' ? Math.min(3, standing) : 1;
              // each member caught takes the damage, but no more than its own hit points
              fhp[k]! -=
                Math.min(dmg, f.horde.memberHp) * times * f.resistFactor +
                (sc.aoe === 'once' ? 0 : 0);
              caught = 3;
            } else {
              fhp[k]! -= dmg * f.resistFactor;
              caught++;
            }
          }
          continue;
        }
        const target = fhp.findIndex((h) => h > 0);
        if (target < 0) return;
        const f = foes[target]!;
        const roll = d20();
        if (roll === 1) continue;
        if (roll === 20 || roll + party.toHit >= f.ac)
          fhp[target]! -= party.dmg * (roll === 20 ? 1.5 : 1) * f.resistFactor;
      }
    };
    const hitPc = (dmg: number) => {
      const alive = pcs.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
      if (!alive.length) return;
      const i = alive[Math.floor(rand() * alive.length)]!;
      pcs[i]! -= dmg;
      maxHit = Math.max(maxHit, dmg);
      if (pcs[i]! <= 0) dropped = true;
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
        if (f.horde) {
          const standing = Math.min(f.horde.size, Math.ceil(fhp[k]! / f.horde.memberHp));
          if (!o.best) return;
          if (sc.attack.kind === 'one') attack(o.best, standing);
          else {
            let left = standing;
            while (left > 0) {
              const m = Math.min(sc.attack.g, left);
              attack(o.best, m);
              left -= m;
            }
          }
          return;
        }
        o.saves.forEach((s, j) => {
          if (!charged[k]![j] && !s.once && s.recharge < 1 && rand() < s.recharge)
            charged[k]![j] = true;
        });
        const pHit = (a: Attack) =>
          Math.min(0.95, Math.max(0.05, (21 - (party.ac - a.toHit)) / 20));
        const routineEv = o.routine.reduce((s, a) => s + a.dmg * pHit(a), 0);
        let bestSave = -1,
          bestEv = 0;
        o.saves.forEach((s, j) => {
          if (!charged[k]![j]) return;
          const fail = Math.min(0.95, Math.max(0.05, (s.dc - party.save - 1) / 20));
          const ev = s.dmg * s.targets * (fail + (s.half ? (1 - fail) / 2 : 0));
          if (ev > bestEv) {
            bestEv = ev;
            bestSave = j;
          }
        });
        if (bestSave >= 0 && bestEv > routineEv) {
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
        } else for (const a of o.routine) attack(a, 1);
        if (o.bonus) attack(o.bonus, 1);
        if (o.legendaryAttack)
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
    taken += pcs.reduce((s, h) => s + (party.hp - Math.max(0, h)), 0) / (party.hp * party.size);
    rounds += round;
    if (dropped) drop++;
    spike += maxHit / party.hp;
  }
  return { taken: taken / runs, rounds: rounds / runs, drop: drop / runs, spike: spike / runs };
}

const root = process.argv[2]!;
const real = loadMonsters(`${root}/resources/srd-2024.jsonl`, '2024').filter((r) => {
  const o = offenceOf(r.data);
  return !!o.best || o.saves.length;
});
const members = [...real, ...loadMonsters(`${root}/resources/srd-2014.jsonl`, '2014')].filter(
  (r) => crNum(r.data.cr) <= 5 && !!offenceOf(r.data).best,
);
const out: Record<string, unknown> = {};
for (const sc of SCENARIOS) {
  // reference curve for this party (area damage changes nothing against one foe, but recompute for honesty)
  const refStats = real.map((r, i) => {
    const f = foeOf(r.data);
    const lv: Stats[] = [];
    for (let L = 1; L <= 20; L++) lv[L] = fightH([f], partyFor(L), sc, RUNS, 5000 + i * 37 + L);
    return { cr: r.data.cr, lv };
  });
  const curve: number[][] = [];
  for (let L = 1; L <= 20; L++) {
    const row: (number | null)[] = CR.map((c) => {
      const g = refStats.filter((r) => r.cr === c);
      return g.length ? median(g.map((r) => r.lv[L]!.taken)) : null;
    });
    for (let i = 0; i < row.length; i++)
      if (row[i] === null) {
        let a = i - 1;
        while (a >= 0 && row[a] === null) a--;
        let b = i + 1;
        while (b < row.length && row[b] === null) b++;
        row[i] =
          a < 0
            ? row[b]!
            : b >= row.length
              ? row[a]!
              : row[a]! + ((row[b]! - row[a]!) * (i - a)) / (b - a);
      }
    const mono = row as number[];
    for (let i = 1; i < mono.length; i++) mono[i] = Math.max(mono[i]!, mono[i - 1]! + 1e-6);
    curve[L] = mono;
  }
  const realFeel = (c: string, k: keyof Stats) => {
    const L = levelForCr(c);
    const g = refStats.filter((r) => r.cr === c);
    return g.length ? median(g.map((r) => r.lv[L]![k])) : NaN;
  };
  const eqIdx = (L: number, v: number) => {
    const c = curve[L]!;
    if (v <= c[0]!) return 0;
    for (let i = 0; i < c.length - 1; i++)
      if (v <= c[i + 1]!) return i + (v - c[i]!) / (c[i + 1]! - c[i]!);
    return c.length - 1;
  };
  const fightsLike = (foes: Foe[], seed: number) => {
    const memo = new Map<number, Stats>();
    const at = (L: number) => {
      if (!memo.has(L)) memo.set(L, fightH(foes, partyFor(L), sc, RUNS, seed + L));
      return memo.get(L)!;
    };
    let best = 0,
      gap = Infinity;
    for (let i = 0; i <= crIdx('20'); i++) {
      const e = eqIdx(levelForCr(CR[i]!), at(levelForCr(CR[i]!)).taken);
      if (Math.abs(e - i) < gap) {
        gap = Math.abs(e - i);
        best = e;
      }
    }
    return { idx: best, at };
  };
  const rows: unknown[] = [];
  let seed = 1;
  for (const s of members) {
    const o = offenceOf(s.data);
    for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 15, 20]) {
      const h = fightsLike([foeOf(s.data, n)], seed++ * 11);
      const c = CR[Math.max(0, Math.min(crIdx('20'), Math.round(h.idx)))]!;
      const feel = h.at(levelForCr(c));
      const ind =
        sc.attack.kind === 'one' && n <= 10
          ? fightsLike(
              Array.from({ length: n }, () => foeOf(s.data)),
              seed++ * 11,
            ).idx
          : null;
      rows.push({
        key: s.key,
        ed: s.edition,
        cr: s.data.cr,
        xp: s.data.xp,
        n,
        idx: h.idx,
        ind,
        rounds: feel.rounds,
        drop: feel.drop,
        spike: feel.spike,
        realRounds: realFeel(c, 'rounds'),
        realDrop: realFeel(c, 'drop'),
        realSpike: realFeel(c, 'spike'),
        atk: o.best!.dmg,
        dpr: rawDpr(o),
        hp: s.data.hp!.average,
      });
    }
  }
  out[sc.name] = rows;
  console.log('done', sc.name);
}
writeFileSync(process.argv[3]!, JSON.stringify(out));
void XP;
