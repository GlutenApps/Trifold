/**
 * Dice expressions (DATA-FORMATS.md §2.4): `NdM`, integers, `+`, `-`, parentheses, whitespace,
 * and `kh`/`kl` keep-highest/lowest (`4d6kh3`). Parsing and rolling are separate so the tracker
 * can show what an expression will do before rolling it.
 */

export type Rng = () => number; // uniform in [0, 1)

export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: 'h' | 'l'; n: number };
}
export interface ConstTerm {
  kind: 'const';
  sign: 1 | -1;
  value: number;
}
export interface GroupTerm {
  kind: 'group';
  sign: 1 | -1;
  terms: Term[];
}
export type Term = DiceTerm | ConstTerm | GroupTerm;

export interface DiceRoll {
  term: DiceTerm;
  rolls: number[];
  kept: number[];
  subtotal: number;
}

export interface RollResult {
  expression: string;
  total: number;
  dice: DiceRoll[];
}

export class DiceError extends Error {
  override name = 'DiceError';
}

const MAX_COUNT = 1000;
const MAX_SIDES = 1000;
const TOKEN = /\d*d\d+(?:k[hl]\d+)?|\d+|[()+-]/gi;
const DICE = /^(\d*)d(\d+)(?:k([hl])(\d+))?$/i;

function tokenize(expression: string): string[] {
  const compact = expression.replace(/\s+/g, '');
  if (compact.length === 0) throw new DiceError('empty dice expression');
  const tokens = compact.match(TOKEN) ?? [];
  if (tokens.join('') !== compact) {
    throw new DiceError(`cannot parse dice expression "${expression}"`);
  }
  return tokens;
}

export function parseDice(expression: string): Term[] {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = (): string | undefined => tokens[pos];
  const next = (): string => {
    const t = tokens[pos];
    if (t === undefined) throw new DiceError(`unexpected end of "${expression}"`);
    pos += 1;
    return t;
  };

  function parseExpr(): Term[] {
    const terms: Term[] = [];
    let sign: 1 | -1 = 1;
    if (peek() === '+' || peek() === '-') sign = next() === '-' ? -1 : 1;
    for (;;) {
      terms.push(parseTerm(sign));
      const p = peek();
      if (p === '+' || p === '-') {
        sign = next() === '-' ? -1 : 1;
        continue;
      }
      return terms;
    }
  }

  function parseTerm(sign: 1 | -1): Term {
    const tok = next();
    if (tok === '(') {
      const terms = parseExpr();
      if (next() !== ')') throw new DiceError(`expected ")" in "${expression}"`);
      return { kind: 'group', sign, terms };
    }
    const dice = DICE.exec(tok);
    if (dice) {
      const count = dice[1] ? Number(dice[1]) : 1;
      const sides = Number(dice[2]);
      if (count < 1 || count > MAX_COUNT)
        throw new DiceError(`dice count out of range in "${tok}"`);
      if (sides < 1 || sides > MAX_SIDES)
        throw new DiceError(`dice sides out of range in "${tok}"`);
      const term: DiceTerm = { kind: 'dice', sign, count, sides };
      if (dice[3] && dice[4]) {
        const n = Number(dice[4]);
        if (n < 1) throw new DiceError(`keep count must be at least 1 in "${tok}"`);
        term.keep = { mode: dice[3].toLowerCase() === 'h' ? 'h' : 'l', n: Math.min(n, count) };
      }
      return term;
    }
    if (/^\d+$/.test(tok)) return { kind: 'const', sign, value: Number(tok) };
    throw new DiceError(`unexpected "${tok}" in "${expression}"`);
  }

  const terms = parseExpr();
  if (pos !== tokens.length) throw new DiceError(`unexpected "${tokens[pos]}" in "${expression}"`);
  return terms;
}

export function isDiceExpression(text: string): boolean {
  try {
    parseDice(text);
    return true;
  } catch {
    return false;
  }
}

function rollTerms(terms: Term[], rng: Rng, out: DiceRoll[]): number {
  let sum = 0;
  for (const term of terms) {
    switch (term.kind) {
      case 'const':
        sum += term.sign * term.value;
        break;
      case 'group':
        sum += term.sign * rollTerms(term.terms, rng, out);
        break;
      case 'dice': {
        const rolls: number[] = [];
        for (let i = 0; i < term.count; i += 1) {
          rolls.push(1 + Math.floor(rng() * term.sides));
        }
        let kept = rolls;
        if (term.keep) {
          const highest = term.keep.mode === 'h';
          kept = [...rolls].sort((a, b) => (highest ? b - a : a - b)).slice(0, term.keep.n);
        }
        const subtotal = kept.reduce((a, b) => a + b, 0);
        out.push({ term, rolls, kept, subtotal });
        sum += term.sign * subtotal;
        break;
      }
    }
  }
  return sum;
}

export function roll(expression: string, rng: Rng = Math.random): RollResult {
  const dice: DiceRoll[] = [];
  const total = rollTerms(parseDice(expression), rng, dice);
  return { expression, total, dice };
}

function averageTerms(terms: Term[]): number {
  let sum = 0;
  for (const term of terms) {
    switch (term.kind) {
      case 'const':
        sum += term.sign * term.value;
        break;
      case 'group':
        sum += term.sign * averageTerms(term.terms);
        break;
      case 'dice': {
        // Keep-highest/lowest averages are approximated by the kept count of plain dice.
        const n = term.keep ? term.keep.n : term.count;
        sum += term.sign * n * ((term.sides + 1) / 2);
        break;
      }
    }
  }
  return sum;
}

/** Expected value of an expression (exact for plain dice, approximate with kh/kl). */
export function average(expression: string): number {
  return averageTerms(parseDice(expression));
}

/** Doubles every die (not the modifiers), as a critical hit does. */
export function doubleDice(terms: Term[]): Term[] {
  return terms.map((t): Term => {
    if (t.kind === 'dice')
      return { ...t, count: t.count * 2, ...(t.keep ? { keep: { ...t.keep } } : {}) };
    if (t.kind === 'group') return { ...t, terms: doubleDice(t.terms) };
    return t;
  });
}

export function formatTerms(terms: Term[]): string {
  return terms
    .map((t, i) => {
      const sign = t.sign < 0 ? '-' : i === 0 ? '' : '+';
      if (t.kind === 'const') return `${sign}${t.value}`;
      if (t.kind === 'group') return `${sign}(${formatTerms(t.terms)})`;
      const keep = t.keep ? `k${t.keep.mode}${t.keep.n}` : '';
      return `${sign}${t.count}d${t.sides}${keep}`;
    })
    .join('');
}
