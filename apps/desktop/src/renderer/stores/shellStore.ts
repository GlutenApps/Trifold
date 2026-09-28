import { useEffect } from 'react';
import { create } from 'zustand';
import type {
  DockMode,
  MajorKind,
  MinorKind,
  ShellLayout,
  WorkspacePreset,
  WorkspaceSettings,
} from '@trifold/schema';
import { useAppStore } from './appStore';
import {
  applyPreset,
  closeTab,
  cloneLayout,
  defaultLayout,
  groupOf,
  matchesPreset,
  moveTab,
  normalize,
  openMajor,
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
} from './shellLayout';

export type Space = 'library' | 'console';
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
  /** A minor shown as a flyout (dock icons-only or hidden). One at a time. */
  flyout: MinorKind | null;
  /** A tab being dragged across the stage, and whether it hovers the split zone. */
  draggingTab: MajorKind | null;
  splitHover: boolean;
  /** The last tab the user asked for; its group flashes once. */
  focusedTab: MajorKind | null;
  /** Set when closing a campaign needs the stop-sharing warning. */
  closePrompt: boolean;
  /** Window width; below 1400 with a split stage a narrow dock shows as icons (§4). */
  viewportWidth: number;
  /** The DM expanded a trimmed dock; cleared on the next resize. */
  dockExpanded: boolean;
  hydratedFor: string | null;

  setViewportWidth(width: number): void;
  expandDock(): void;
  /** The dock as drawn: the layout's mode, or icons when trimmed for a narrow window. */
  effectiveDock(): DockMode;

  hydrate(libraryPath: string, settings: WorkspaceSettings | undefined): void;
  enterConsole(slug: string): void;
  enterLibrary(page?: LibraryPage): void;
  setLibraryPage(page: LibraryPage): void;
  leaveCampaign(): void;
  /** Drops the saved console layout of a deleted campaign. */
  forgetConsole(slug: string): void;
  setClosePrompt(open: boolean): void;

  openMajor(kind: MajorKind, opts?: { group?: 0 | 1; avoid?: MajorKind }): void;
  closeTab(kind: MajorKind): void;
  moveTab(kind: MajorKind, group: 0 | 1, index?: number): void;
  reorderTab(kind: MajorKind, index: number): void;
  splitRight(kind: MajorKind): void;
  setSplit(split: number): void;
  toggleMaximize(group?: number): void;
  focusGroup(group: 0 | 1): void;
  clearFocusedTab(): void;
  setDraggingTab(kind: MajorKind | null): void;
  setSplitHover(on: boolean): void;

  setDockMode(mode: DockMode): void;
  setDockWidth(px: number): void;
  toggleDock(): void;
  toggleSection(tool: MinorKind): void;
  /** Brings a tool forward: a section when the dock shows them, otherwise a flyout. */
  openTool(tool: MinorKind): void;
  reorderSection(tool: MinorKind, index: number): void;
  closeFlyout(): void;

  applyLayout(index: number): void;
  savePreset(name: string): void;
  updatePreset(index: number): void;
  renamePreset(index: number, name: string): void;
  movePreset(index: number, direction: -1 | 1): void;
  deletePreset(index: number): void;
  restoreStarterLayouts(): void;
  currentPresetIndex(): number;
}

let persistTimer: number | null = null;

/** Chrome edits are frequent while dragging; the Library sees one write per settle. */
function persist(get: () => ShellState): void {
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    const { presets, consoles, layout, campaignSlug } = get();
    const next = { ...consoles };
    if (campaignSlug) next[campaignSlug] = layout;
    void useAppStore.getState().updateSettings({
      workspace: { presets, seeded: true, consoles: next },
    });
  }, 500);
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
    flyout: null,
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
      const { layout, viewportWidth, dockExpanded } = get();
      const trimmed =
        layout.dock.state === 'narrow' &&
        layout.stage.groups.length === 2 &&
        viewportWidth < 1400 &&
        !dockExpanded;
      return trimmed ? 'icons' : layout.dock.state;
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
      });
      if (!seeded) persist(get);
    },

    enterConsole(slug) {
      const { campaignSlug, layout, consoles } = get();
      // Coming back from the Library to the same campaign keeps the console exactly as it was.
      const saved = campaignSlug === slug ? layout : consoles[slug];
      set({
        space: 'console',
        campaignSlug: slug,
        layout: saved ? normalize(cloneLayout(saved)) : defaultLayout(),
        focusedGroup: 0,
        flyout: null,
        closePrompt: false,
      });
    },

    enterLibrary(page) {
      const { campaignSlug, layout, consoles } = get();
      set({
        space: 'library',
        flyout: null,
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
      change(splitRight(get().layout, kind));
      set({ focusedGroup: 1 });
    },

    setSplit(split) {
      change(setSplit(get().layout, split));
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

    setDockMode(mode) {
      change(setDockMode(get().layout, mode));
      if (mode === 'wide' || mode === 'narrow') set({ flyout: null });
    },

    setDockWidth(px) {
      change(setDockWidth(get().layout, px));
    },

    toggleDock() {
      const { state } = get().layout.dock;
      get().setDockMode(state === 'hidden' ? 'narrow' : 'hidden');
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

    applyLayout(index) {
      const preset = get().presets[index];
      if (!preset || get().space !== 'console') return;
      change(applyPreset(get().layout, preset.layout));
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

/** Runs `refresh` each time a tab becomes the active one of its group (data may have gone stale). */
export function useTabFocus(kind: MajorKind, refresh: () => void): void {
  const active = useShellStore((s) => s.layout.stage.groups.some((g) => g.active === kind));
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);
}
