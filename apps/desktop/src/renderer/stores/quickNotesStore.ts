import { create } from 'zustand';
import { useShellStore } from './shellStore';

/**
 * Where Quick notes (ADR 0018) sends focus back to. The DM may be typing in a note, a search
 * field or the tracker when they reach for Ctrl+N or the dock button; Save and Escape return
 * them there. The last focused element outside the dock and its flyout is tracked as focus
 * moves, so a mouse click on the dock button (which takes focus itself) still knows where the
 * DM was. `pendingFocus` asks the tool to focus its title field once it is on screen.
 */
interface QuickNotesState {
  pendingFocus: boolean;
  /** Opens the tool, in the dock or as a flyout, and focuses its title field. */
  summon(): void;
  /** The tool took the focus request. */
  focusTaken(): void;
  /** Ends a capture: closes the flyout if that is where the tool is, and refocuses. */
  finish(): void;
}

let lastOutside: HTMLElement | null = null;

const insideTool = (el: Element) => !!el.closest('.dock, .fly');

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && el !== document.body && !insideTool(el)) lastOutside = el;
  });
}

export const useQuickNotesStore = create<QuickNotesState>((set) => ({
  pendingFocus: false,

  summon() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !insideTool(active)) {
      lastOutside = active;
    }
    useShellStore.getState().showTool('quickNotes');
    set({ pendingFocus: true });
  },

  focusTaken() {
    set({ pendingFocus: false });
  },

  finish() {
    const shell = useShellStore.getState();
    if (shell.flyout === 'quickNotes') shell.closeFlyout();
    const target = lastOutside;
    if (target?.isConnected) target.focus();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  },
}));
