/**
 * The table's protocol (ADR 0076): one number both sides of a table connection compare. It goes
 * up when a message changes in a way the other side cannot read (a field renamed or removed, a
 * meaning changed); an added optional field does not move it. A player's Trifold on another
 * protocol than the GM's does not join, and is told which side to update. The same protocol on
 * different app versions plays, with a note.
 */
export const TABLE_PROTOCOL = 1;

/**
 * Which side has to update for this player's Trifold to play at that table: `gm` when the table
 * is on an older protocol (a table that sends none is older than this check), `player` when it is
 * on a newer one, null when they match.
 */
export function whoMustUpdate(
  theirs: unknown,
  mine: number = TABLE_PROTOCOL,
): 'gm' | 'player' | null {
  const n = typeof theirs === 'number' && Number.isInteger(theirs) ? theirs : 0;
  if (n === mine) return null;
  return n < mine ? 'gm' : 'player';
}

/** An app version as a table sends it: short, printable, or nothing. */
export function cleanAppVersion(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9A-Za-z.+-]{1,40}$/.test(value) ? value : undefined;
}
