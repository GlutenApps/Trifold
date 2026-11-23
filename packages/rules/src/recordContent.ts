import type { CompendiumRecord } from '@trifold/schema';

/**
 * What a record says, for telling real duplicates from reprints (ADR 0063). Two importers store
 * the same rules differently (the bundled SRD and a compendium file split and word things their
 * own way), so copies are compared by their numbers and by how much of their rules text they
 * share, never by how they are stored. Measured on a 14,000-record file against the SRD, this
 * counts 808 of 832 reprints as the same and leaves about 200 records whose copies disagree.
 */

/** Words that carry no rules meaning, left out of the comparison. */
const STOP = new Set(
  'a an the of to and or in on at by for with is are be its it this that as you your from'.split(
    ' ',
  ),
);

/** Fewer rules words than this on one side, and only the numbers are compared. */
export const SHORT_TEXT = 12;
/** The share of the shorter text the longer must hold for two copies to say the same thing. */
export const SAME_TEXT = 0.8;

function words(text: string | undefined, out: string[]): void {
  const plain = (text ?? '')
    .toLowerCase()
    .replace(/[*_`>#]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
  for (const w of plain.split(' ')) if (w && !STOP.has(w)) out.push(w);
}

function features(list: ReadonlyArray<{ name: string; text: string }> | undefined, out: string[]) {
  for (const f of list ?? []) {
    words(f.name, out);
    words(f.text, out);
  }
}

/**
 * The numbers that decide a record at the table: a monster's CR, AC and HP; a spell's level and
 * school; an item's rarity, AC and damage. Equal numbers are needed for two copies to be the same.
 */
export function recordNumbers(record: CompendiumRecord): string {
  const tidy = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  switch (record.kind) {
    case 'monster':
      return [record.data.cr, record.data.ac?.value ?? '', record.data.hp?.average ?? ''].join('|');
    case 'spell':
      return [record.data.level, tidy(record.data.school).slice(0, 2)].join('|');
    case 'item':
      return [tidy(record.data.rarity), record.data.ac ?? '', tidy(record.data.dmg1)].join('|');
    default:
      return '';
  }
}

/** A record's rules text as words: stat block features, a spell's text, a class's features. */
export function recordWords(record: CompendiumRecord): string[] {
  const out: string[] = [];
  switch (record.kind) {
    case 'monster':
      features(record.data.traits, out);
      features(record.data.actions, out);
      features(record.data.bonusActions, out);
      features(record.data.reactions, out);
      features(record.data.legendary?.actions, out);
      break;
    case 'species':
    case 'background':
      features(record.data.traits, out);
      break;
    case 'class':
      for (const level of record.data.levels) features(level.features, out);
      break;
    default:
      words(record.data.text, out);
  }
  return out;
}

/**
 * How much of the shorter text the longer one holds, by words, 0 to 1. A summary inside a full
 * version holds together; a text with almost nothing to compare counts as the same, so a bare SRD
 * dagger does not clash with a described one.
 */
export function sharedText(a: readonly string[], b: readonly string[]): number {
  const small = Math.min(a.length, b.length);
  if (small < SHORT_TEXT) return 1;
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of b) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      shared += 1;
      counts.set(w, n - 1);
    }
  }
  return shared / small;
}

/** Whether two copies of a record, of the same edition, disagree: their numbers or their rules. */
export function copiesDiffer(
  a: { numbers: string; words: readonly string[] },
  b: { numbers: string; words: readonly string[] },
): boolean {
  return a.numbers !== b.numbers || sharedText(a.words, b.words) < SAME_TEXT;
}
