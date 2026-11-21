/**
 * Horde audit (ADR 0052). Usage: `tsx scripts/cr-audit/horde.ts`
 *
 * Builds hordes of 2–20 of every SRD creature up to CR 5, fights each the way the tracker runs a
 * horde (pooled hit points, one attack roll per three members standing, an area effect hurting
 * each member it catches), and finds the CR it fights like. Prints that next to the CR the app
 * shows (`hordeCr`), and how the fights feel next to real monsters of that CR.
 */
import { fileURLToPath } from 'node:url';
import {
  hordeAreaDamage,
  hordeAttackGroups,
  hordeCr,
  hordeStanding,
} from '../../packages/rules/src/combat/horde';
import {
  type Attack,
  CR,
  crIdx,
  crNum,
  type Foe,
  foeOf,
  levelForCr,
  loadMonsters,
  median,
  offenceOf,
  type Party,
  partyFor,
  rng,
} from './lib';

const RUNS = 160;
const SIZES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
interface Stats {
  taken: number;
  rounds: number;
  drop: number;
  spike: number;
}

/**
 * One foe against the party, as the tracker plays it. From 3rd level one PC in four casts an
 * area save spell (about three quarters of its damage lands) at up to three creatures, or at up
 * to three members of a horde.
 */
function fight(foe: Foe, party: Party, seed: number): Stats {
  const rand = rng(seed);
  const d20 = () => 1 + Math.floor(rand() * 20);
  const area = party.level >= 3;
  let taken = 0;
  let rounds = 0;
  let drop = 0;
  let spike = 0;
  for (let r = 0; r < RUNS; r++) {
    const pcs = Array.from({ length: party.size }, () => party.hp);
    let hp = foe.hp;
    const charged = foe.offence.saves.map(() => true);
    let round = 0;
    let dropped = false;
    let maxHit = 0;
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
      if (roll === 20) hitPc(a.dmg * mult * 1.5);
      else if (roll + a.toHit >= party.ac) hitPc(a.dmg * mult);
    };
    const partyTurn = () => {
      for (let i = 0; i < party.size && hp > 0; i++) {
        if (pcs[i]! <= 0) continue;
        if (area && i === 0) {
          const dmg = party.dmg * 0.75 * foe.resistFactor;
          hp -= foe.horde ? hordeAreaDamage(dmg, 3, foe.horde, hp) : dmg;
          continue;
        }
        const roll = d20();
        if (roll === 1) continue;
        if (roll === 20 || roll + party.toHit >= foe.ac) {
          hp -= party.dmg * (roll === 20 ? 1.5 : 1) * foe.resistFactor;
        }
      }
    };
    const foeTurn = () => {
      if (hp <= 0) return;
      const o = foe.offence;
      if (foe.horde) {
        const standing = hordeStanding(hp, foe.horde.memberHp, foe.horde.size);
        if (o.best) for (const g of hordeAttackGroups(standing)) attack(o.best, g);
        return;
      }
      o.saves.forEach((s, j) => {
        if (!charged[j] && !s.once && s.recharge < 1 && rand() < s.recharge) charged[j] = true;
      });
      const pHit = (a: Attack) => Math.min(0.95, Math.max(0.05, (21 - (party.ac - a.toHit)) / 20));
      const routine = o.routine.reduce((s, a) => s + a.dmg * pHit(a), 0);
      let best = -1;
      let bestEv = 0;
      o.saves.forEach((s, j) => {
        if (!charged[j]) return;
        const fail = Math.min(0.95, Math.max(0.05, (s.dc - party.save - 1) / 20));
        const ev = s.dmg * s.targets * (fail + (s.half ? (1 - fail) / 2 : 0));
        if (ev > bestEv) {
          bestEv = ev;
          best = j;
        }
      });
      if (best >= 0 && bestEv > routine) {
        const s = o.saves[best]!;
        charged[best] = false;
        const alive = pcs.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
        for (let t = 0; t < Math.min(s.targets, alive.length); t++) {
          const fail = d20() + party.save < s.dc;
          const dmg = fail ? s.dmg : s.half ? s.dmg / 2 : 0;
          if (dmg > 0) {
            pcs[alive[t]!]! -= dmg;
            maxHit = Math.max(maxHit, dmg);
            if (pcs[alive[t]!]! <= 0) dropped = true;
          }
        }
      } else for (const a of o.routine) attack(a, 1);
      if (o.bonus) attack(o.bonus, 1);
      if (o.legendaryAttack) {
        for (let u = 0; u < o.legendaryUses; u++) if (rand() < 0.5) attack(o.legendaryAttack, 1);
      }
    };
    const first = rand() < 0.5;
    while (round < 12 && hp > 0 && pcs.some((h) => h > 0)) {
      round++;
      if (first) {
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
  return { taken: taken / RUNS, rounds: rounds / RUNS, drop: drop / RUNS, spike: spike / RUNS };
}

const root = fileURLToPath(new URL('../..', import.meta.url));
const real = loadMonsters(`${root}/resources/srd-2024.jsonl`, '2024').filter((r) => {
  const o = offenceOf(r.data);
  return !!o.best || o.saves.length > 0;
});
// The yardstick, fought the same way: the median real monster of each CR at each level.
const refStats = real.map((r, i) => {
  const foe = foeOf(r.data);
  const lv: Stats[] = [];
  for (let L = 1; L <= 20; L++) lv[L] = fight(foe, partyFor(L), 5000 + i * 37 + L);
  return { cr: r.data.cr, lv };
});
const curve: number[][] = [];
for (let L = 1; L <= 20; L++) {
  const row = CR.map((c) => {
    const g = refStats.filter((r) => r.cr === c);
    return g.length ? median(g.map((r) => r.lv[L]!.taken)) : NaN;
  });
  for (let i = 0; i < row.length; i++) {
    if (!Number.isNaN(row[i])) continue;
    let a = i - 1;
    while (a >= 0 && Number.isNaN(row[a])) a--;
    let b = i + 1;
    while (b < row.length && Number.isNaN(row[b])) b++;
    row[i] =
      a < 0
        ? row[b]!
        : b >= row.length
          ? row[a]!
          : row[a]! + ((row[b]! - row[a]!) * (i - a)) / (b - a);
  }
  for (let i = 1; i < row.length; i++) row[i] = Math.max(row[i]!, row[i - 1]! + 1e-6);
  curve[L] = row;
}
const eqIdx = (L: number, v: number) => {
  const c = curve[L]!;
  if (v <= c[0]!) return 0;
  for (let i = 0; i < c.length - 1; i++) {
    if (v <= c[i + 1]!) return i + (v - c[i]!) / (c[i + 1]! - c[i]!);
  }
  return c.length - 1;
};
const realFeel = (c: string, k: keyof Stats) =>
  median(refStats.filter((r) => r.cr === c).map((r) => r.lv[levelForCr(c)]![k]));

interface Row extends Stats {
  cr: string;
  n: number;
  idx: number;
  shown: number;
}
const rows: Row[] = [];
let seed = 1;
const members = [...real, ...loadMonsters(`${root}/resources/srd-2014.jsonl`, '2014')].filter(
  (r) => crNum(r.data.cr) <= 5 && !!offenceOf(r.data).best,
);
for (const s of members) {
  for (const n of SIZES) {
    const foe = foeOf(s.data, n);
    // The CR it fights like: where a party of that CR's level finds it as hard as a real one.
    let idx = 0;
    let gap = Infinity;
    const at = new Map<number, Stats>();
    for (let i = 0; i <= crIdx('20'); i++) {
      const L = levelForCr(CR[i]!);
      if (!at.has(L)) at.set(L, fight(foe, partyFor(L), seed++ * 11));
      const e = eqIdx(L, at.get(L)!.taken);
      if (Math.abs(e - i) < gap) {
        gap = Math.abs(e - i);
        idx = e;
      }
    }
    const shown = crIdx(hordeCr(s.data.cr, n));
    const feel = at.get(levelForCr(CR[Math.min(crIdx('20'), shown)]!))!;
    rows.push({ cr: s.data.cr, n, idx, shown, ...feel });
  }
}

console.log('CR a horde fights like (median of the simulation) / CR the app shows');
console.log('member'.padEnd(7) + SIZES.map((n) => `x${n}`.padStart(9)).join(''));
for (const c of ['0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5']) {
  const g = rows.filter((r) => r.cr === c);
  if (!g.length) continue;
  const cell = (n: number) => {
    const h = g.filter((r) => r.n === n);
    return `${CR[Math.round(median(h.map((r) => r.idx)))]}/${CR[h[0]!.shown]}`.padStart(9);
  };
  console.log(c.padEnd(7) + SIZES.map(cell).join(''));
}
const errs = rows.filter((r) => r.idx <= crIdx('20')).map((r) => r.shown - Math.round(r.idx));
console.log(
  `\nshown vs simulated: within ±1 step ${((100 * errs.filter((e) => Math.abs(e) <= 1).length) / errs.length).toFixed(0)}%, median miss ${median(errs).toFixed(2)} steps`,
);
console.log(
  '\nFeel at the CR shown (median), horde vs real: rounds, chance a PC drops, biggest hit / PC HP',
);
for (const n of [4, 6, 10, 15, 20]) {
  const g = rows.filter((r) => r.n === n && r.shown <= crIdx('20'));
  const real = (k: keyof Stats) =>
    median(g.map((r) => realFeel(CR[r.shown]!, k)).filter((x) => !Number.isNaN(x)));
  const f = (k: keyof Stats) => `${median(g.map((r) => r[k])).toFixed(2)} vs ${real(k).toFixed(2)}`;
  console.log(
    `x${String(n).padEnd(3)} rounds ${f('rounds')}   drop ${f('drop')}   spike ${f('spike')}`,
  );
}
