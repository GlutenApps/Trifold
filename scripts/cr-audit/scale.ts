/**
 * CR scaler audit (ADR 0051). Usage: `tsx scripts/cr-audit/scale.ts [parts to leave out]`,
 * e.g. `tsx scripts/cr-audit/scale.ts legendary,area` to measure what the extras are worth.
 *
 * Scales every SRD monster (both editions) to a ladder of CRs with the app's scaler and fights it
 * against a party of the target's level. Prints how far each group lands from the target, in steps
 * on the CR list (+ is harder; the source monster's own miss is taken off), how far from the CR the
 * scaler shows (which drops when parts are left out), and how the fights feel next to real ones.
 */
import { fileURLToPath } from 'node:url';
import { SCALE_PARTS, scaleCr, type ScalePart } from '../../packages/rules/src/crScale';
import {
  CR,
  crIdx,
  crNum,
  fight,
  foeOf,
  levelForCr,
  loadMonsters,
  median,
  offenceOf,
  partyFor,
  type Monster,
} from './lib';
import { buildReference } from './reference';

const root = fileURLToPath(new URL('../..', import.meta.url));
const leaveOut = new Set((process.argv[2] ?? '').split(',').filter(Boolean));
const parts = new Set<ScalePart>(SCALE_PARTS.filter((p) => !leaveOut.has(p)));
const RUNS = 200;
const ref = buildReference(root);

const subjects = [
  ...loadMonsters(`${root}/resources/srd-2024.jsonl`, '2024'),
  ...loadMonsters(`${root}/resources/srd-2014.jsonl`, '2014'),
].filter((r) => {
  const o = offenceOf(r.data);
  return !!o.best || o.saves.length > 0;
});
const TARGETS = ['1/4', '1/2', '1', '2', '3', '4', '5', '6', '8', '10', '12', '14', '16', '20'];

interface Row {
  from: string;
  to: string;
  /** Steps from the target. */
  gap: number;
  /** Steps from the CR the scaler shows. */
  shownGap: number;
  rounds: number;
  drop: number;
  spike: number;
}
const rows: Row[] = [];
let seed = 1;
for (const s of subjects) {
  const L0 = levelForCr(s.data.cr);
  const own =
    crIdx(s.data.cr) <= crIdx('20')
      ? ref.eqIdx(L0, fight([foeOf(s.data)], partyFor(L0), RUNS, seed++).taken) - crIdx(s.data.cr)
      : 0;
  for (const t of TARGETS) {
    if (t === s.data.cr) continue;
    const res = scaleCr(s.data, t, parts, s.name);
    const foe = foeOf(res.monster as Monster);
    const L = levelForCr(t);
    const f = fight([foe], partyFor(L), RUNS, seed++);
    const gap = ref.eqIdx(L, f.taken) - crIdx(t) - own;
    const shown = CR.includes(res.cr) ? res.cr : t;
    const Ls = levelForCr(shown);
    const shownGap =
      shown === t
        ? gap
        : ref.eqIdx(Ls, fight([foe], partyFor(Ls), RUNS, seed++).taken) - crIdx(shown) - own;
    rows.push({
      from: s.data.cr,
      to: t,
      gap,
      shownGap,
      rounds: f.rounds,
      drop: f.drop,
      spike: f.spike,
    });
  }
}

const up = (r: Row) => crIdx(r.to) > crIdx(r.from);
const groups: Record<string, (r: Row) => boolean> = {
  'up from CR 0-1/2': (r) => up(r) && crNum(r.from) < 1,
  'up from CR 1-10': (r) => up(r) && crNum(r.from) >= 1 && crNum(r.from) <= 10,
  'up to CR 12+ from <= 4': (r) => up(r) && crNum(r.from) <= 4 && crNum(r.to) >= 12,
  'up to CR 12+ from 5-10': (r) =>
    up(r) && crNum(r.from) >= 5 && crNum(r.from) <= 10 && crNum(r.to) >= 12,
  'down to CR 1/4-1/2': (r) => !up(r) && crNum(r.to) < 1,
  'down to CR 1-8': (r) => !up(r) && crNum(r.to) >= 1 && crNum(r.to) <= 8,
  'down from CR 11+': (r) => !up(r) && crNum(r.from) >= 11,
};
const share = (xs: number[]) =>
  `${((100 * xs.filter((x) => Math.abs(x) <= 1).length) / xs.length).toFixed(0)}%`;
const line = (name: string, g: Row[]) =>
  `${name.padEnd(24)} ${String(g.length).padStart(5)}  ${median(g.map((r) => r.gap))
    .toFixed(2)
    .padStart(7)} ${share(g.map((r) => r.gap)).padStart(5)}  ${median(g.map((r) => r.shownGap))
    .toFixed(2)
    .padStart(7)} ${share(g.map((r) => r.shownGap)).padStart(5)}`;
console.log(`Scaler audit, parts left out: ${[...leaveOut].join(', ') || 'none'}`);
console.log('                             n   vs target ±1   vs shown ±1');
for (const [name, f] of Object.entries(groups)) console.log(line(name, rows.filter(f)));
console.log(
  line('all', rows),
  `  median |gap| ${median(rows.map((r) => Math.abs(r.gap))).toFixed(2)}`,
);
console.log(
  '\nFeel at the target (median), scaled vs real: rounds, chance a PC drops, biggest hit / PC HP',
);
for (const t of ['1/2', '2', '5', '10', '12', '16', '20']) {
  const g = rows.filter((r) => r.to === t);
  const f = (k: 'rounds' | 'drop' | 'spike') =>
    `${median(g.map((r) => r[k])).toFixed(2)} vs ${ref.realFeel(t, k).toFixed(2)}`;
  console.log(`CR ${t.padEnd(4)} rounds ${f('rounds')}   drop ${f('drop')}   spike ${f('spike')}`);
}
