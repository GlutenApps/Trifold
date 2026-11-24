/**
 * Recent campaigns: the order the Campaigns page and the top bar's switcher list campaigns in,
 * the short list the switcher shows, and the "opened 3 days ago" line. Pure; the dates are ISO
 * strings as they are kept on disk.
 */

/** How many campaigns of each kind (running, playing) the top bar's switcher lists. */
export const SWITCHER_RECENT = 5;

/** The Campaigns page offers a filter once the Library holds more campaigns than this. */
export const FILTER_FROM = 8;

/** A campaign as these functions see it: when it was last opened, and a date to fall back on. */
export interface RecentItem {
  /** When it was last opened; null or absent when it never has been. */
  openedAt?: string | null;
  /** When it was last changed or joined: the order of campaigns never opened. */
  fallbackAt: string;
  name: string;
}

/** Most recently opened first; never-opened ones by their fallback date; then by name. */
export function compareRecent(a: RecentItem, b: RecentItem): number {
  const at = (x: RecentItem) => x.openedAt ?? x.fallbackAt;
  return at(b).localeCompare(at(a)) || a.name.localeCompare(b.name);
}

/**
 * The first `max` of a list already in recent order, keeping the open campaign in it: when it
 * falls outside, it takes the last place. `more` says whether anything was left out.
 */
export function recentSlice<T>(
  list: readonly T[],
  isCurrent: (item: T) => boolean,
  max: number = SWITCHER_RECENT,
): { shown: T[]; more: boolean } {
  if (list.length <= max) return { shown: [...list], more: false };
  const shown = list.slice(0, max);
  const current = list.find(isCurrent);
  if (current !== undefined && !shown.includes(current)) shown[max - 1] = current;
  return { shown, more: true };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * When a campaign was last opened, in words: "today", "yesterday", "3 days ago", "2 weeks ago",
 * "4 months ago", "over a year ago". Counted in calendar days on the local clock.
 */
export function openedAgo(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'some time ago';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return 'over a year ago';
}

/** Whether a campaign's name matches what was typed in the filter: every word, in any order. */
export function matchesCampaignFilter(name: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = name.toLowerCase();
  return words.every((w) => haystack.includes(w));
}
