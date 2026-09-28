/**
 * The one hotkey registry (CLAUDE.md: every table-time action has a hotkey registered in one
 * hotkeys.ts). Features register on mount and unregister on unmount; `listHotkeys` feeds the
 * cheat sheet.
 */
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

export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
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
