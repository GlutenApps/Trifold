import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { webTabKey, type MinorKind, type TabKey } from '@trifold/schema';
import { useCombatStore } from './stores/combatStore';
import { landingGroup } from './stores/shellLayout';
import { useShellStore } from './stores/shellStore';

/**
 * Deep links (ADR 0017, docs/DEEP-LINKS.md): the one way a feature opens another feature's
 * item. `navigate(target)` brings the item's home forward (a stage tab or a dock tool, placed by
 * `landingGroup` when the tab was closed) and posts the target; the panel that owns the type
 * picks it up through `useNavTarget`, shows the item, and calls `landOn` to scroll to it and
 * flash it. Global search, and later note links, call `navigate` and nothing else. Adding a
 * type: extend `NavTarget`, map its home in `homeOf`, and give its panel a `useNavTarget`.
 */
export type NavTarget =
  | { type: 'note'; id: string; anchor?: { phrase: string; occurrence: number } }
  | { type: 'folder'; id: string }
  | { type: 'npc'; id: string }
  | { type: 'pc'; id: string }
  | {
      type: 'encounter';
      id: string;
      anchor?: { field: 'notes'; phrase: string; occurrence: number };
    }
  | { type: 'scene'; id: string }
  | { type: 'record'; id: string }
  | { type: 'webTab'; id: string };

export type NavType = NavTarget['type'];
export type NavTargetOf<T extends NavType> = Extract<NavTarget, { type: T }>;

export interface PendingNav {
  target: NavTarget;
  seq: number;
}

interface NavState {
  /** The target no panel has landed yet; cleared by the panel that does. */
  pending: PendingNav | null;
}

export const useNavStore = create<NavState>(() => ({ pending: null }));

let seq = 0;

/** The stage tab or dock tool that shows a target. */
export function homeOf(target: NavTarget): { tab: TabKey } | { tool: MinorKind } {
  switch (target.type) {
    case 'note':
    case 'folder':
    case 'npc':
    case 'pc':
      return { tab: 'campaign' };
    case 'encounter':
      return { tab: 'encounters' };
    case 'record':
      return { tab: 'compendium' };
    case 'scene':
      return { tool: 'scenes' };
    case 'webTab':
      return { tab: webTabKey(target.id) };
  }
}

/**
 * Opens the target's home and posts the target for its panel. A closed tab lands away from
 * the VTT, then away from a running fight, else in the focused group (ADR 0017); an open tab
 * stays where it is. Only the console has these homes, so the Library ignores the call.
 */
export function navigate(target: NavTarget): void {
  const shell = useShellStore.getState();
  if (shell.space !== 'console') return;
  shell.closePop();
  shell.closeFlyout();
  const home = homeOf(target);
  if ('tool' in home) {
    shell.openTool(home.tool);
  } else {
    const avoid: TabKey[] = ['map'];
    if (useCombatStore.getState().encounterId && home.tab !== 'encounters') {
      avoid.push('encounters');
    }
    shell.openMajor(home.tab, {
      group: landingGroup(shell.layout, home.tab, avoid, shell.focusedGroup),
    });
  }
  // A web tab is its own landing; everything else waits for its panel.
  if (target.type === 'webTab') return;
  useNavStore.setState({ pending: { target, seq: ++seq } });
}

/** Clears the pending target once a panel has shown it. */
export function navDone(pendingSeq: number): void {
  if (useNavStore.getState().pending?.seq === pendingSeq) useNavStore.setState({ pending: null });
}

/**
 * Lets a panel act on targets of `types`. The handler runs when such a target is posted and
 * again when the panel mounts with one still pending (a sub-tab that had to be switched to
 * first). It returns true once the item is on screen, which clears the target; a panel that
 * only switches towards the item (the Campaign tab picking a sub-tab) returns false and leaves
 * the landing to the panel inside it.
 */
export function useNavTarget<T extends NavType>(
  types: T | readonly T[],
  handler: (target: NavTargetOf<T>) => boolean,
): void {
  const pending = useNavStore((s) => s.pending);
  const latest = useRef(handler);
  latest.current = handler;
  const wanted = (Array.isArray(types) ? types : [types]) as readonly T[];
  const key = wanted.join(',');
  useEffect(() => {
    if (!pending) return;
    if (!(wanted as readonly string[]).includes(pending.target.type)) return;
    if (latest.current(pending.target as NavTargetOf<T>)) navDone(pending.seq);
    // `key` stands in for `wanted`, which is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, key]);
}

/** The `data-nav` value an element carries so `landOn` can find it. */
export function navKey(type: NavType, id: string): string {
  return `${type}:${id}`;
}

const FLASH_CLASS = 'nav-flash';
const LAND_FRAMES = 30;

/**
 * Scrolls to and flashes every element marked `data-nav={key}`, retrying over a few frames so
 * a panel can post the target before React has drawn the item. `then` runs once with the first
 * element, for anchors that need the DOM (selecting a phrase in a text field).
 */
export function landOn(key: string, then?: (el: HTMLElement) => void): void {
  let frames = 0;
  const attempt = () => {
    const found = document.querySelectorAll<HTMLElement>(`[data-nav="${CSS.escape(key)}"]`);
    if (found.length === 0) {
      if (++frames < LAND_FRAMES) requestAnimationFrame(attempt);
      return;
    }
    found.forEach((el, i) => {
      if (i === 0) el.scrollIntoView({ block: 'nearest' });
      el.classList.remove(FLASH_CLASS);
      // Reflow so a second landing on the same element restarts the animation.
      void el.offsetWidth;
      el.classList.add(FLASH_CLASS);
      const clear = () => el.classList.remove(FLASH_CLASS);
      el.addEventListener('animationend', clear, { once: true });
      window.setTimeout(clear, 2000);
    });
    then?.(found[0]!);
  };
  attempt();
}

/**
 * Selects the `occurrence`th case-insensitive `phrase` in a text field and scrolls it into
 * view: the anchor landing for plain-text fields such as an encounter's DM notes.
 */
export function selectPhrase(field: HTMLTextAreaElement, phrase: string, occurrence: number): void {
  const haystack = field.value.toLowerCase();
  const needle = phrase.toLowerCase();
  if (!needle) return;
  let at = -1;
  for (let i = 0; i <= occurrence; i += 1) {
    at = haystack.indexOf(needle, at + 1);
    if (at < 0) return;
  }
  field.focus();
  field.setSelectionRange(at, at + needle.length);
}
