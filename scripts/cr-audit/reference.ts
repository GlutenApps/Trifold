/**
 * The yardstick: every real SRD 5.2 monster fought by parties of level 1–20. "Fights like CR X"
 * means a party of CR X's level loses the share of its hit points it loses to the median real
 * monster of CR X.
 */
import {
  CR,
  type FightStats,
  crIdx,
  fight,
  foeOf,
  levelForCr,
  loadMonsters,
  maxDc,
  median,
  partyFor,
  rawDpr,
} from './lib';

export interface RefRow {
  key: string;
  cr: string;
  hp: number;
  ac: number;
  toHit: number | null;
  dc: number | null;
  dpr: number;
  lv: FightStats[];
}

export interface Reference {
  rows: RefRow[];
  /** Fractional position on the CR list whose typical monster takes `taken` at level L. */
  eqIdx(L: number, taken: number): number;
  /** The median real monster of a CR, fought at that CR's level. */
  realFeel(cr: string, key: 'rounds' | 'drop' | 'spike'): number;
}

export function buildReference(root: string, runs = 300): Reference {
  const rows: RefRow[] = [];
  loadMonsters(`${root}/resources/srd-2024.jsonl`, '2024').forEach((r, i) => {
    const foe = foeOf(r.data);
    const o = foe.offence;
    if (!o.best && o.saves.length === 0) return;
    const lv: FightStats[] = [];
    for (let L = 1; L <= 20; L++) lv[L] = fight([foe], partyFor(L), runs, 1000 + i * 31 + L);
    rows.push({
      key: r.key,
      cr: r.data.cr,
      hp: r.data.hp!.average,
      ac: r.data.ac!.value,
      toHit: o.best?.toHit ?? null,
      dc: maxDc(r.data),
      dpr: rawDpr(o),
      lv,
    });
  });
  const curve: number[][] = [];
  for (let L = 1; L <= 20; L++) {
    const row: (number | null)[] = CR.map((c) => {
      const g = rows.filter((r) => r.cr === c);
      return g.length ? median(g.map((r) => r.lv[L]!.taken)) : null;
    });
    // CRs with no SRD monster are interpolated; the curve never falls.
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== null) continue;
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
  return {
    rows,
    eqIdx(L, v) {
      const c = curve[L]!;
      if (v <= c[0]!) return 0;
      for (let i = 0; i < c.length - 1; i++) {
        if (v <= c[i + 1]!) return i + (v - c[i]!) / (c[i + 1]! - c[i]!);
      }
      return c.length - 1;
    },
    realFeel(cr, key) {
      // Above CR 20 the SRD is thin: use the nearest CR with a few monsters.
      let i = crIdx(cr);
      while (i > 0 && rows.filter((r) => r.cr === CR[i]).length < 3) i--;
      const g = rows.filter((r) => r.cr === CR[i]);
      return median(g.map((r) => r.lv[levelForCr(cr)]![key]));
    },
  };
}
