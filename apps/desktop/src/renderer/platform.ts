/**
 * The one place the renderer asks which OS it is on (ADR 0006). Everything else is identical on
 * Windows and macOS; the differences are the primary modifier key, how a combo is written, and
 * where the window controls sit.
 */
export const isMac: boolean =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

/** Marks `<html data-platform="mac|win">` so CSS can leave room for the window controls. */
export function applyPlatformClass(doc: Document = document): void {
  doc.documentElement.dataset['platform'] = isMac ? 'mac' : 'win';
}

const MAC_KEYS: Record<string, string> = {
  Ctrl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
  Meta: '⌃',
  Enter: '↩',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Left: '←',
  Right: '→',
};

const WIN_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Meta: 'Win',
};

/**
 * A registered combo (`Ctrl+Alt+ArrowRight`) as the user should read it: `Ctrl+Alt+Right` on
 * Windows, `⌘⌥→` on macOS, where "Ctrl" in a combo means the Command key (see `comboFromEvent`).
 */
export function hk(combo: string): string {
  const parts = combo.split('+');
  if (isMac) return parts.map((p) => MAC_KEYS[p] ?? p).join('');
  return parts.map((p) => WIN_KEYS[p] ?? p).join('+');
}
