/**
 * The one hotkey registry (CLAUDE.md: every table-time action has a hotkey registered in one
 * hotkeys.ts). Features register on mount and unregister on unmount; `listHotkeys` feeds the
 * cheat sheet.
 */
import { isMac } from './platform';

export interface Hotkey {
  id: string;
  /** `Ctrl+Shift+B` style; see `comboFromEvent`. */
  combo: string;
  description: string;
  run(): void;
}

const registry = new Map<string, Hotkey>();

export function registerHotkey(hotkey: Hotkey): () => void {
  registry.set(hotkey.id, hotkey);
  return () => {
    if (registry.get(hotkey.id) === hotkey) registry.delete(hotkey.id);
  };
}

export function listHotkeys(): Hotkey[] {
  return [...registry.values()];
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta']);

/**
 * Combos are written once, Windows-style. `Ctrl` is the primary modifier: the Control key on
 * Windows and the Command key on macOS, where Control is the rarely used extra (`Meta`), so a
 * feature registers `Ctrl+K` and gets Cmd+K on a Mac for free. `hk()` in platform.ts renders a
 * combo for display.
 */
export function comboFromEvent(e: KeyboardEvent, mac: boolean = isMac): string {
  const parts: string[] = [];
  const primary = mac ? e.metaKey : e.ctrlKey;
  const secondary = mac ? e.ctrlKey : e.metaKey;
  if (primary) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (secondary) parts.push('Meta');
  if (!MODIFIER_KEYS.has(e.key)) {
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  }
  return parts.join('+');
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Runs the matching hotkey. Plain keys are ignored while typing; Ctrl/Alt combos always fire. */
export function handleKeydown(e: KeyboardEvent): boolean {
  const hasModifier = e.ctrlKey || e.altKey || e.metaKey;
  if (isTyping(e.target) && !hasModifier) return false;
  const combo = comboFromEvent(e);
  // Most recently registered wins, so a page can shadow a global combo while it is mounted.
  for (const hotkey of [...registry.values()].reverse()) {
    if (hotkey.combo === combo) {
      e.preventDefault();
      hotkey.run();
      return true;
    }
  }
  return false;
}

export function installHotkeys(target: Window = window): () => void {
  const listener = (e: KeyboardEvent) => {
    handleKeydown(e);
  };
  target.addEventListener('keydown', listener);
  return () => target.removeEventListener('keydown', listener);
}

/**
 * Keys that act on a focused control rather than the whole console, listed here so the cheat
 * sheet shows them beside the hotkeys. The control handles them itself; nothing here runs.
 */
export interface FocusedKeys {
  /** What has to be focused, for the cheat sheet's heading. */
  on: string;
  keys: readonly { combo: string; description: string }[];
}

export const FOCUSED_KEYS: readonly FocusedKeys[] = [
  {
    on: 'On a focused counter',
    keys: [
      { combo: 'ArrowUp', description: 'Add the primary step' },
      { combo: 'ArrowDown', description: 'Take the primary step' },
      { combo: 'Shift+ArrowUp', description: 'Add the alternate step (or PageUp)' },
      { combo: 'Shift+ArrowDown', description: 'Take the alternate step (or PageDown)' },
      { combo: 'Home', description: 'Go to the minimum, when it has one' },
      { combo: 'End', description: 'Go to the maximum, when it has one' },
    ],
  },
];
