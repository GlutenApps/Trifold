/**
 * The DM's clock as this phone sees it. Times the DM's Trifold stamps (the break timer's end) are
 * on the DM's computer's clock, and a phone's clock can be seconds off it, so the page keeps the
 * difference it saw when it connected and counts against that.
 */
let offset = 0;

/** Called with the DM's `Date.now()` when the server says hello. */
export function syncClock(dmTime: number): void {
  if (Number.isFinite(dmTime)) offset = dmTime - Date.now();
}

/** Now, on the DM's clock. */
export function dmNow(): number {
  return Date.now() + offset;
}
