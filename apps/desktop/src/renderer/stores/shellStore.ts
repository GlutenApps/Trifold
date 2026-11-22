import { useMemo } from 'react';
import { create } from 'zustand';
import { ulid } from 'ulid';
import {
  webTabKey,
  type DockMode,
  type PlayerShellLayout,
  type ShellLayout,
  type TrayItem,
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
  defaultPlayerLayout,
  fitLayout,
  fromPlayerLayout,
  groupOf,
  matchesPreset,
  moveTab,
  normalize,
  openMajor,
  pruneTabs,
  pruneTray,
  reorderTab,
  expandDockFromIcons,
  setDockMode,
  setDockWidth,
  setSection,
  setSplit,
  setTrayItem,
  splitRight,
  STARTER_PRESETS,
  toggleMaximize,
  toggleSection,
  toPlayerLayout,
  ROLE_TOOLS,
  type Fit,
  type Layout,
  type ShellRole,
  type StageKey,
  type ToolKind,
} from './shellLayout';

/**
 * The console shell (ADR 0004): which space is showing, the campaign whose console is loaded,
 * its stage and dock layout, the DM's saved layouts, the Library's web tabs (ADR 0011), and the
 * transient chrome (flyout, pop-up, tab drag, close prompt, window fit). Layouts, each
 * campaign's console and the web tabs persist as `settings.workspace` in the Library's
 * `library.json` through `persist`, one write per settle; the store is hydrated once per
 * Library path. The layout math itself lives in shellLayout.ts; this store only applies it,
 * keeps the result and saves it. Features change the shell through these actions only.
 *
 * One console is loaded at a time, in one of two roles (docs/PLAYER-MODE.md): the GM's, for a
 * campaign this Library runs, or the player's, for one it joined. The role decides which tabs and
 * tools the layout may hold and where it is saved (`consoles` by slug, `playerConsoles` by the
 * joined campaign's id). Named layouts are the GM's.
 */
export type Space = 'library' | 'console';
/** Tools that pop up from their own button rather than living in the dock (ADR 0009), plus the
 *  global search's results under its field in the top bar (ADR 0017). */
export type PopKind = 'dice' | 'hotkeys' | 'layouts' | 'search' | 'tray';
export type LibraryPage = 'campaigns' | 'compendium' | 'images' | 'music' | 'settings';

interface ShellState {
  space: Space;
  libraryPage: LibraryPage;
  /** Slug of the campaign whose console is loaded; null in the Library with nothing open. */
  campaignSlug: string | null;
  /** Whose console is loaded. `gm` in the Library too, where no console is. */
  role: ShellRole;
  /** The joined campaign whose player console is loaded, by the GM's campaign id; else null. */
  joinedId: string | null;
  layout: Layout;
  /** Which stage group has keyboard focus (N/P, Ctrl+K act on it where it matters). */
  focusedGroup: 0 | 1;
  presets: WorkspacePreset[];
  consoles: Record<string, ShellLayout>;
  /** Each joined campaign's player console as it was left, by the GM's campaign id. */
  playerConsoles: Record<string, PlayerShellLayout>;
  /** The Library's saved web tabs (ADR 0011); a layout names them by `web:<id>`. */
  webTabs: WebTab[];
  /** A minor shown as a flyout while the dock shows icons only (ADR 0009). One at a time. */
  flyout: ToolKind | null;
  /** A tool popped up from its own button (ADR 0009): Dice from the strip, Hotkeys and Layouts
   *  from the top bar. One at a time; not part of a layout. */
  pop: PopKind | null;
  /** A tab being dragged across the stage. */
  draggingTab: StageKey | null;
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
  /** Loads the player console of a joined campaign. No GM campaign is open beside it. */
  enterPlayerConsole(joinedId: string): void;
  enterLibrary(page?: LibraryPage): void;
  setLibraryPage(page: LibraryPage): void;
  leaveCampaign(): void;
  /** Drops the saved console layout of a deleted campaign. */
  forgetConsole(slug: string): void;
  /** Drops the saved player console of a campaign the player left. */
  forgetPlayerConsole(joinedId: string): void;
  setClosePrompt(open: boolean): void;

  openMajor(kind: StageKey, opts?: { group?: 0 | 1; avoid?: StageKey }): void;
  closeTab(kind: StageKey): void;
  moveTab(kind: StageKey, group: 0 | 1, index?: number): void;
  reorderTab(kind: StageKey, index: number): void;
  splitRight(kind: StageKey): void;
  setSplit(split: number): void;
  toggleMaximize(group?: number): void;
  focusGroup(group: 0 | 1): void;
  setDraggingTab(kind: StageKey | null): void;

  /** Saves a web tab and opens it in `group` (default the focused one). Returns its key.
   *  A blank title means "follow the page title". */
  addWebTab(tab: { url: string; title?: string; icon?: WebTabIcon }, group?: 0 | 1): StageKey;
  updateWebTab(id: string, patch: Partial<Omit<WebTab, 'id'>>): void;
  /** Forgets a web tab: closes it here and drops it from every saved layout. */
  removeWebTab(id: string): void;

  setDockMode(mode: DockMode): void;
  /** Opens a dock the DM collapsed to icons, at the width it had before. */
  openDock(): void;
  setDockWidth(px: number): void;
  toggleSection(tool: ToolKind): void;
  /** Brings a tool forward: a section when the dock shows them, otherwise a flyout. */
  openTool(tool: ToolKind): void;
  /** Like openTool, but never closes a flyout that is already showing the tool. */
  showTool(tool: ToolKind): void;
  closeFlyout(): void;
  /** Opens a pop-up from its button, or closes it when it is the one showing. */
  togglePop(kind: PopKind): void;
  openPop(kind: PopKind): void;
  closePop(): void;

  /** Puts a section on the tray or takes it off (ADR 0023); a full tray takes nothing more. */
  setTrayItem(item: TrayItem, on: boolean): void;
  /** Drops the open campaign's missing timers and counters from the tray as it is now. */
  pruneTray(keep: (item: TrayItem) => boolean): void;
  /** A timer or counter was deleted: off the tray here, in every campaign's console and layout. */
  forgetTrayItem(item: TrayItem): void;

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
      const { presets, webTabs } = get();
      const { consoles, playerConsoles } = withLoaded(get());
      return useAppStore.getState().updateSettings({
        workspace: { presets, seeded: true, consoles, webTabs, playerConsoles },
      });
    },
    500,
  );
}

/**
 * The saved consoles with the loaded one's layout written into its own map: the GM's by campaign
 * slug, the player's by joined campaign id (without a tray, which a player console has none of).
 */
function withLoaded(
  state: Pick<
    ShellState,
    'role' | 'campaignSlug' | 'joinedId' | 'layout' | 'consoles' | 'playerConsoles'
  >,
): Pick<ShellState, 'consoles' | 'playerConsoles'> {
  const { role, campaignSlug, joinedId, layout, consoles, playerConsoles } = state;
  if (role === 'player') {
    return {
      consoles,
      playerConsoles: joinedId
        ? { ...playerConsoles, [joinedId]: toPlayerLayout(layout) }
        : playerConsoles,
    };
  }
  return {
    // A GM console's layout holds GM kinds only: it came from `consoles`, a preset or the default.
    consoles: campaignSlug ? { ...consoles, [campaignSlug]: layout as ShellLayout } : consoles,
    playerConsoles,
  };
}

/**
 * A new web tab's first title: the site's host without a leading `www.`, until the page reports
 * its own. An address that does not parse gets the generic label rather than an error.
 */
function hostOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || 'Web tab';
  } catch {
    return 'Web tab';
  }
}

/**
 * A layout name no other preset uses: the trimmed name (or "Layout"), with " 2", " 3" and so on
 * appended while it clashes. `skip` is the preset being renamed, so keeping its own name is
 * never a clash.
 */
function uniqueName(name: string, presets: WorkspacePreset[], skip = -1): string {
  const base = name.trim() || 'Layout';
  let candidate = base;
  for (let n = 2; presets.some((p, i) => i !== skip && p.name === candidate); n++) {
    candidate = `${base} ${n}`;
  }
  return candidate;
}

export const useShellStore = create<ShellState>((set, get) => {
  const change = (layout: Layout) => {
    if (layout === get().layout) return;
    set({ layout });
    persist(get);
  };
  /** The loaded console's dock tools, in the dock's order. */
  const tools = () => ROLE_TOOLS[get().role];
  const dockShowsSections = () => {
    const s = get().effectiveDock();
    return s === 'wide' || s === 'narrow';
  };

  return {
    space: 'library',
    libraryPage: 'campaigns',
    campaignSlug: null,
    role: 'gm',
    joinedId: null,
    layout: defaultLayout(),
    focusedGroup: 0,
    presets: [],
    consoles: {},
    playerConsoles: {},
    webTabs: [],
    flyout: null,
    pop: null,
    draggingTab: null,
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
        playerConsoles: settings?.playerConsoles ?? {},
        webTabs: settings?.webTabs ?? [],
      });
      if (!seeded) persist(get);
    },

    enterConsole(slug) {
      const { role, campaignSlug, layout, consoles, webTabs } = get();
      // Coming back from the Library to the same campaign keeps the console exactly as it was.
      const saved = role === 'gm' && campaignSlug === slug ? layout : consoles[slug];
      set({
        // A player console that was loaded keeps its layout before this one takes its place.
        ...withLoaded(get()),
        space: 'console',
        role: 'gm',
        joinedId: null,
        campaignSlug: slug,
        layout: saved ? pruneTabs(normalize(cloneLayout(saved)), webTabs) : defaultLayout(),
        focusedGroup: 0,
        flyout: null,
        pop: null,
        closePrompt: false,
      });
    },

    enterPlayerConsole(joinedId) {
      const state = get();
      const playerTools = ROLE_TOOLS.player;
      // Coming back from the Library to the same joined campaign keeps the console as it was.
      const same = state.role === 'player' && state.joinedId === joinedId;
      const saved = state.playerConsoles[joinedId];
      const layout = same
        ? state.layout
        : saved
          ? pruneTabs(normalize(fromPlayerLayout(saved), playerTools), state.webTabs, playerTools)
          : defaultPlayerLayout();
      set({
        ...withLoaded(state),
        space: 'console',
        role: 'player',
        joinedId,
        campaignSlug: null,
        layout,
        focusedGroup: 0,
        flyout: null,
        pop: null,
        closePrompt: false,
      });
    },

    enterLibrary(page) {
      set({
        space: 'library',
        flyout: null,
        pop: null,
        ...withLoaded(get()),
        ...(page ? { libraryPage: page } : {}),
      });
    },

    setLibraryPage(page) {
      set({ libraryPage: page });
    },

    leaveCampaign() {
      set({
        ...withLoaded(get()),
        space: 'library',
        campaignSlug: null,
        role: 'gm',
        joinedId: null,
        // A player console's layout never stays loaded as the GM's.
        ...(get().role === 'player' ? { layout: defaultLayout() } : {}),
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

    forgetPlayerConsole(joinedId) {
      const { playerConsoles, joinedId: loaded, role } = get();
      const isLoaded = role === 'player' && loaded === joinedId;
      if (!(joinedId in playerConsoles) && !isLoaded) return;
      const next = { ...playerConsoles };
      delete next[joinedId];
      set({
        playerConsoles: next,
        ...(isLoaded
          ? {
              joinedId: null,
              role: 'gm' as const,
              layout: defaultLayout(),
              space: 'library' as const,
            }
          : {}),
      });
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
      set({ focusedGroup: at as 0 | 1 });
      // Asking for a tab while another group is maximized means "show me that one instead".
      if (next.stage.maximized !== null && next.stage.maximized !== at) {
        next.stage.maximized = at;
      }
      change(next);
    },

    closeTab(kind) {
      change(closeTab(get().layout, kind, tools()));
      if (get().focusedGroup >= get().layout.stage.groups.length) set({ focusedGroup: 0 });
    },

    moveTab(kind, group, index) {
      change(moveTab(get().layout, kind, group, index, tools()));
      set({ focusedGroup: group });
    },

    reorderTab(kind, index) {
      change(reorderTab(get().layout, kind, index, tools()));
    },

    splitRight(kind) {
      if (!get().fit().canSplit) return;
      change(splitRight(get().layout, kind, tools()));
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

    setDraggingTab(kind) {
      set({ draggingTab: kind });
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
      const { webTabs, presets, consoles, playerConsoles, layout } = get();
      const remaining = webTabs.filter((t) => t.id !== id);
      if (remaining.length === webTabs.length) return;
      const playerTools = ROLE_TOOLS.player;
      set({
        webTabs: remaining,
        layout: pruneTabs(layout, remaining, tools()),
        playerConsoles: Object.fromEntries(
          Object.entries(playerConsoles).map(([joined, l]) => [
            joined,
            toPlayerLayout(pruneTabs(fromPlayerLayout(l), remaining, playerTools)),
          ]),
        ),
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

    openDock() {
      change(expandDockFromIcons(get().layout));
      set({ flyout: null });
    },

    setDockWidth(px) {
      change(setDockWidth(get().layout, px, get().fit().dockMax));
    },

    toggleSection(tool) {
      change(toggleSection(get().layout, tool, tools()));
    },

    openTool(tool) {
      if (dockShowsSections()) {
        change(setSection(get().layout, tool, true, tools()));
        set({ flyout: null });
      } else {
        set({ flyout: get().flyout === tool ? null : tool });
      }
    },

    showTool(tool) {
      if (dockShowsSections()) {
        change(setSection(get().layout, tool, true, tools()));
        set({ flyout: null });
      } else if (get().flyout !== tool) {
        set({ flyout: tool });
      }
    },

    closeFlyout() {
      if (get().flyout) set({ flyout: null });
    },

    togglePop(kind) {
      set({ pop: get().pop === kind ? null : kind });
    },

    openPop(kind) {
      if (get().pop !== kind) set({ pop: kind });
    },

    closePop() {
      if (get().pop) set({ pop: null });
    },

    setTrayItem(item, on) {
      change(setTrayItem(get().layout, item, on));
    },

    pruneTray(keep) {
      change(pruneTray(get().layout, keep));
    },

    forgetTrayItem(item) {
      const { layout, presets, consoles } = get();
      const keep = (t: TrayItem) => t !== item;
      set({
        layout: pruneTray(layout, keep),
        presets: presets.map((p) => ({ ...p, layout: pruneTray(p.layout, keep) })),
        consoles: Object.fromEntries(
          Object.entries(consoles).map(([slug, l]) => [slug, pruneTray(l, keep)]),
        ),
      });
      persist(get);
    },

    applyLayout(index) {
      const preset = get().presets[index];
      // Named layouts are the GM's: they name GM tabs and tools.
      if (!preset || get().space !== 'console' || get().role !== 'gm') return;
      change(applyPreset(preset.layout, get().webTabs));
      set({ focusedGroup: 0, flyout: null });
    },

    savePreset(name) {
      const presets = get().presets;
      if (get().role !== 'gm') return;
      set({
        presets: presets.concat({
          name: uniqueName(name, presets),
          layout: cloneLayout(get().layout as ShellLayout),
        }),
      });
      persist(get);
    },

    updatePreset(index) {
      if (get().role !== 'gm') return;
      set({
        presets: get().presets.map((p, i) =>
          i === index ? { ...p, layout: cloneLayout(get().layout as ShellLayout) } : p,
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
      const { layout, presets, role } = get();
      if (role !== 'gm') return -1;
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
