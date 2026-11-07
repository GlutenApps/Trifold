import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { ulid } from 'ulid';
import {
  webTabKey,
  type DockMode,
  type MinorKind,
  type ShellLayout,
  type TabKey,
  type WebTab,
  type WebTabIcon,
  type WorkspacePreset,
  type WorkspaceSettings,
} from '@trifold/schema';
import { scheduleSave } from './pendingSaves';
import { useAppStore } from './appStore';
import {
  applyPreset,
  closeTab,
  cloneLayout,
  defaultLayout,
  fitLayout,
  groupOf,
  matchesPreset,
  moveTab,
  normalize,
  openMajor,
  pruneTabs,
  reorderSection,
  reorderTab,
  setDockMode,
  setDockWidth,
  setSection,
  setSplit,
  splitRight,
  STARTER_PRESETS,
  toggleMaximize,
  toggleSection,
  type Fit,
} from './shellLayout';

export type Space = 'library' | 'console';
/** Tools that pop up from their own button rather than living in the dock (ADR 0009). */
export type PopKind = 'dice' | 'hotkeys' | 'layouts';
export type LibraryPage = 'campaigns' | 'compendium' | 'music' | 'settings';

interface ShellState {
  space: Space;
  libraryPage: LibraryPage;
  /** Slug of the campaign whose console is loaded; null in the Library with nothing open. */
  campaignSlug: string | null;
  layout: ShellLayout;
  /** Which stage group has keyboard focus (N/P, Ctrl+K act on it where it matters). */
  focusedGroup: 0 | 1;
  presets: WorkspacePreset[];
  consoles: Record<string, ShellLayout>;
  /** The Library's saved web tabs (ADR 0011); a layout names them by `web:<id>`. */
  webTabs: WebTab[];
  /** A minor shown as a flyout (dock icons-only or hidden). One at a time. */
  flyout: MinorKind | null;
  /** A tool popped up from its own button (ADR 0009): Dice from the strip, Hotkeys and Layouts
   *  from the top bar. One at a time; not part of a layout. */
  pop: PopKind | null;
  /** A tab being dragged across the stage, and whether it hovers the split zone. */
  draggingTab: TabKey | null;
  splitHover: boolean;
  /** The last tab the user asked for; its group flashes once. */
  focusedTab: TabKey | null;
  /** Set when closing a campaign needs the stop-sharing warning. */
  closePrompt: boolean;
  /** Window width: what fits side by side is worked out from it (fitLayout, ADR 0014). */
  viewportWidth: number;
  /** The DM expanded a trimmed dock, folding the groups instead; cleared on the next resize. */
  dockExpanded: boolean;
  hydratedFor: string | null;

  setViewportWidth(width: number): void;
  expandDock(): void;
  /** The dock as drawn: the layout's mode, or icons when trimmed for a narrow window. */
  effectiveDock(): DockMode;
  /** What the window can show of the layout right now. */
  fit(): Fit;

  hydrate(libraryPath: string, settings: WorkspaceSettings | undefined): void;
  enterConsole(slug: string): void;
  enterLibrary(page?: LibraryPage): void;
  setLibraryPage(page: LibraryPage): void;
  leaveCampaign(): void;
  /** Drops the saved console layout of a deleted campaign. */
  forgetConsole(slug: string): void;
  setClosePrompt(open: boolean): void;

  openMajor(kind: TabKey, opts?: { group?: 0 | 1; avoid?: TabKey }): void;
  closeTab(kind: TabKey): void;
  moveTab(kind: TabKey, group: 0 | 1, index?: number): void;
  reorderTab(kind: TabKey, index: number): void;
  splitRight(kind: TabKey): void;
  setSplit(split: number): void;
  toggleMaximize(group?: number): void;
  focusGroup(group: 0 | 1): void;
  clearFocusedTab(): void;
  setDraggingTab(kind: TabKey | null): void;
  setSplitHover(on: boolean): void;

  /** Saves a web tab and opens it in `group` (default the focused one). Returns its key.
   *  A blank title means "follow the page title". */
  addWebTab(tab: { url: string; title?: string; icon?: WebTabIcon }, group?: 0 | 1): TabKey;
  updateWebTab(id: string, patch: Partial<Omit<WebTab, 'id'>>): void;
  /** Forgets a web tab: closes it here and drops it from every saved layout. */
  removeWebTab(id: string): void;

  setDockMode(mode: DockMode): void;
  setDockWidth(px: number): void;
  toggleSection(tool: MinorKind): void;
  /** Brings a tool forward: a section when the dock shows them, otherwise a flyout. */
  openTool(tool: MinorKind): void;
  reorderSection(tool: MinorKind, index: number): void;
  closeFlyout(): void;
  /** Opens a pop-up from its button, or closes it when it is the one showing. */
  togglePop(kind: PopKind): void;
  closePop(): void;

  applyLayout(index: number): void;
  savePreset(name: string): void;
  updatePreset(index: number): void;
  renamePreset(index: number, name: string): void;
  movePreset(index: number, direction: -1 | 1): void;
  deletePreset(index: number): void;
  restoreStarterLayouts(): void;
  currentPresetIndex(): number;
}

/** Chrome edits are frequent while dragging; the Library sees one write per settle. */
function persist(get: () => ShellState): void {
  scheduleSave(
    'shell',
    () => {
      const { presets, consoles, layout, campaignSlug, webTabs } = get();
      const next = { ...consoles };
      if (campaignSlug) next[campaignSlug] = layout;
      return useAppStore.getState().updateSettings({
        workspace: { presets, seeded: true, consoles: next, webTabs },
      });
    },
    500,
  );
}

/** A new web tab's first title: the site's host, until the page reports its own. */
export function hostOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || 'Web tab';
  } catch {
    return 'Web tab';
  }
}

function uniqueName(name: string, presets: WorkspacePreset[], skip = -1): string {
  const base = name.trim() || 'Layout';
  let candidate = base;
  for (let n = 2; presets.some((p, i) => i !== skip && p.name === candidate); n++) {
    candidate = `${base} ${n}`;
  }
  return candidate;
}

export const useShellStore = create<ShellState>((set, get) => {
  const change = (layout: ShellLayout) => {
    if (layout === get().layout) return;
    set({ layout });
    persist(get);
  };
  const dockShowsSections = () => {
    const s = get().effectiveDock();
    return s === 'wide' || s === 'narrow';
  };

  return {
    space: 'library',
    libraryPage: 'campaigns',
    campaignSlug: null,
    layout: defaultLayout(),
    focusedGroup: 0,
    presets: [],
    consoles: {},
    webTabs: [],
    flyout: null,
    pop: null,
    draggingTab: null,
    splitHover: false,
    focusedTab: null,
    closePrompt: false,
    viewportWidth: typeof window === 'undefined' ? 1600 : window.innerWidth,
    dockExpanded: false,
    hydratedFor: null,

    setViewportWidth(width) {
      if (get().viewportWidth === width) return;
      set({ viewportWidth: width, dockExpanded: false });
    },

    expandDock() {
      set({ dockExpanded: true });
    },

    effectiveDock() {
      return get().fit().dock;
    },

    fit() {
      const { layout, viewportWidth, dockExpanded } = get();
      return fitLayout(layout, viewportWidth, dockExpanded);
    },

    hydrate(libraryPath, settings) {
      if (get().hydratedFor === libraryPath) return;
      const seeded = settings?.seeded ?? false;
      set({
        hydratedFor: libraryPath,
        presets: seeded
          ? (settings?.presets ?? [])
          : STARTER_PRESETS.map((p) => ({ name: p.name, layout: cloneLayout(p.layout) })),
        consoles: settings?.consoles ?? {},
        webTabs: settings?.webTabs ?? [],
      });
      if (!seeded) persist(get);
    },

    enterConsole(slug) {
      const { campaignSlug, layout, consoles, webTabs } = get();
      // Coming back from the Library to the same campaign keeps the console exactly as it was.
      const saved = campaignSlug === slug ? layout : consoles[slug];
      set({
        space: 'console',
        campaignSlug: slug,
        layout: saved ? pruneTabs(normalize(cloneLayout(saved)), webTabs) : defaultLayout(),
        focusedGroup: 0,
        flyout: null,
        pop: null,
        closePrompt: false,
      });
    },

    enterLibrary(page) {
      const { campaignSlug, layout, consoles } = get();
      set({
        space: 'library',
        flyout: null,
        pop: null,
        consoles: campaignSlug ? { ...consoles, [campaignSlug]: layout } : consoles,
        ...(page ? { libraryPage: page } : {}),
      });
    },

    setLibraryPage(page) {
      set({ libraryPage: page });
    },

    leaveCampaign() {
      const { campaignSlug, layout, consoles } = get();
      const next = campaignSlug ? { ...consoles, [campaignSlug]: layout } : consoles;
      set({
        space: 'library',
        campaignSlug: null,
        consoles: next,
        flyout: null,
        pop: null,
        closePrompt: false,
      });
      persist(get);
    },

    forgetConsole(slug) {
      const { consoles, campaignSlug } = get();
      if (!(slug in consoles) && campaignSlug !== slug) return;
      const next = { ...consoles };
      delete next[slug];
      set({ consoles: next, ...(campaignSlug === slug ? { campaignSlug: null } : {}) });
      persist(get);
    },

    setClosePrompt(open) {
      set({ closePrompt: open });
    },

    openMajor(kind, opts) {
      const { layout } = get();
      let group = opts?.group;
      if (group === undefined && opts?.avoid && layout.stage.groups.length === 2) {
        const avoidAt = groupOf(layout, opts.avoid);
        if (avoidAt !== null) group = avoidAt === 0 ? 1 : 0;
      }
      const next = openMajor(layout, kind, group);
      const at = groupOf(next, kind) ?? 0;
      set({ focusedGroup: at as 0 | 1, focusedTab: kind });
      // Asking for a tab while another group is maximized means "show me that one instead".
      if (next.stage.maximized !== null && next.stage.maximized !== at) {
        next.stage.maximized = at;
      }
      change(next);
    },

    closeTab(kind) {
      change(closeTab(get().layout, kind));
      if (get().focusedGroup >= get().layout.stage.groups.length) set({ focusedGroup: 0 });
    },

    moveTab(kind, group, index) {
      change(moveTab(get().layout, kind, group, index));
      set({ focusedGroup: group });
    },

    reorderTab(kind, index) {
      change(reorderTab(get().layout, kind, index));
    },

    splitRight(kind) {
      if (!get().fit().canSplit) return;
      change(splitRight(get().layout, kind));
      set({ focusedGroup: 1 });
    },

    setSplit(split) {
      const { splitMin, splitMax } = get().fit();
      change(setSplit(get().layout, split, splitMin, splitMax));
    },

    toggleMaximize(group) {
      const g = group ?? get().focusedGroup;
      change(toggleMaximize(get().layout, g));
    },

    focusGroup(group) {
      if (get().focusedGroup !== group) set({ focusedGroup: group });
    },

    clearFocusedTab() {
      if (get().focusedTab) set({ focusedTab: null });
    },

    setDraggingTab(kind) {
      set({ draggingTab: kind, splitHover: false });
    },

    setSplitHover(on) {
      if (get().splitHover !== on) set({ splitHover: on });
    },

    addWebTab({ url, title, icon }, group) {
      const named = (title ?? '').trim();
      const tab: WebTab = {
        id: ulid(),
        title: named || hostOf(url),
        url,
        autoTitle: !named,
        icon: icon ?? 'globe',
        zoom: 1,
      };
      set({ webTabs: get().webTabs.concat(tab) });
      const key = webTabKey(tab.id);
      get().openMajor(key, { group: group ?? get().focusedGroup });
      persist(get);
      return key;
    },

    updateWebTab(id, patch) {
      const webTabs = get().webTabs;
      if (!webTabs.some((t) => t.id === id)) return;
      set({ webTabs: webTabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
      persist(get);
    },

    removeWebTab(id) {
      const { webTabs, presets, consoles, layout } = get();
      const remaining = webTabs.filter((t) => t.id !== id);
      if (remaining.length === webTabs.length) return;
      set({
        webTabs: remaining,
        layout: pruneTabs(layout, remaining),
        presets: presets.map((p) => ({ ...p, layout: pruneTabs(p.layout, remaining) })),
        consoles: Object.fromEntries(
          Object.entries(consoles).map(([slug, l]) => [slug, pruneTabs(l, remaining)]),
        ),
      });
      if (get().focusedGroup >= get().layout.stage.groups.length) set({ focusedGroup: 0 });
      persist(get);
    },

    setDockMode(mode) {
      change(setDockMode(get().layout, mode));
      if (mode === 'wide' || mode === 'narrow') set({ flyout: null });
    },

    setDockWidth(px) {
      change(setDockWidth(get().layout, px, get().fit().dockMax));
    },

    toggleSection(tool) {
      change(toggleSection(get().layout, tool));
    },

    openTool(tool) {
      if (dockShowsSections()) {
        change(setSection(get().layout, tool, true));
        set({ flyout: null });
      } else {
        set({ flyout: get().flyout === tool ? null : tool });
      }
    },

    reorderSection(tool, index) {
      change(reorderSection(get().layout, tool, index));
    },

    closeFlyout() {
      if (get().flyout) set({ flyout: null });
    },

    togglePop(kind) {
      set({ pop: get().pop === kind ? null : kind });
    },

    closePop() {
      if (get().pop) set({ pop: null });
    },

    applyLayout(index) {
      const preset = get().presets[index];
      if (!preset || get().space !== 'console') return;
      change(applyPreset(preset.layout, get().webTabs));
      set({ focusedGroup: 0, flyout: null });
    },

    savePreset(name) {
      const presets = get().presets;
      set({
        presets: presets.concat({
          name: uniqueName(name, presets),
          layout: cloneLayout(get().layout),
        }),
      });
      persist(get);
    },

    updatePreset(index) {
      set({
        presets: get().presets.map((p, i) =>
          i === index ? { ...p, layout: cloneLayout(get().layout) } : p,
        ),
      });
      persist(get);
    },

    renamePreset(index, name) {
      const presets = get().presets;
      if (!presets[index] || !name.trim()) return;
      const fresh = uniqueName(name, presets, index);
      set({ presets: presets.map((p, i) => (i === index ? { ...p, name: fresh } : p)) });
      persist(get);
    },

    movePreset(index, direction) {
      const presets = [...get().presets];
      const to = index + direction;
      if (!presets[index] || to < 0 || to >= presets.length) return;
      [presets[index], presets[to]] = [presets[to]!, presets[index]!];
      set({ presets });
      persist(get);
    },

    deletePreset(index) {
      set({ presets: get().presets.filter((_, i) => i !== index) });
      persist(get);
    },

    restoreStarterLayouts() {
      const presets = get().presets;
      const missing = STARTER_PRESETS.filter((b) => !presets.some((p) => p.name === b.name)).map(
        (b) => ({ name: b.name, layout: cloneLayout(b.layout) }),
      );
      if (missing.length === 0) return;
      set({ presets: presets.concat(missing) });
      persist(get);
    },

    currentPresetIndex() {
      const { layout, presets } = get();
      return presets.findIndex((p) => matchesPreset(layout, p.layout));
    },
  };
});

/** The current fit, re-computed when the layout, the window width or the dock choice changes. */
export function useFit(): Fit {
  const layout = useShellStore((s) => s.layout);
  const width = useShellStore((s) => s.viewportWidth);
  const expanded = useShellStore((s) => s.dockExpanded);
  return useMemo(() => fitLayout(layout, width, expanded), [layout, width, expanded]);
}

/** Runs `refresh` each time a tab becomes the active one of its group (data may have gone stale). */
export function useTabFocus(kind: TabKey, refresh: () => void): void {
  const active = useShellStore((s) => s.layout.stage.groups.some((g) => g.active === kind));
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);
}
