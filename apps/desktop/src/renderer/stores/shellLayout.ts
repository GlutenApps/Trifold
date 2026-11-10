import {
  MAJOR_KINDS,
  MINOR_KINDS,
  type DockMode,
  type MajorKind,
  type TabKey,
  type WebTab,
  isWebTabKey,
  webTabId,
  type MinorKind,
  type ShellLayout,
  type WorkspacePreset,
} from '@trifold/schema';

/**
 * Pure layout math for the console shell (ADR 0004): a stage of one or two tab groups and a
 * dock of toggled sections. Every function returns a new layout and never leaves an empty
 * group behind when another exists.
 */

const MAJOR_TITLES: Record<MajorKind, string> = {
  campaign: 'Campaign',
  compendium: 'Compendium',
  encounters: 'Encounters',
  map: 'VTT',
};

/** A tab's label: a major's fixed title, or the web tab's own (ADR 0011). */
export function tabTitle(kind: TabKey, webTabs: readonly WebTab[]): string {
  if (!isWebTabKey(kind)) return MAJOR_TITLES[kind];
  const id = webTabId(kind);
  return webTabs.find((t) => t.id === id)?.title ?? 'Web tab';
}

/** Drops web tabs the Library no longer has (a layout saved before one was removed). */
export function pruneTabs(layout: ShellLayout, webTabs: readonly WebTab[]): ShellLayout {
  const ids = new Set(webTabs.map((t) => t.id));
  const keep = (k: TabKey) => !isWebTabKey(k) || ids.has(webTabId(k));
  if (layout.stage.groups.every((g) => g.tabs.every(keep))) return layout;
  const next = cloneLayout(layout);
  for (const g of next.stage.groups) g.tabs = g.tabs.filter(keep);
  return normalize(next);
}

export const MINOR_TITLES: Record<MinorKind, string> = {
  music: 'Music',
  scenes: 'Scenes',
};

/**
 * The dock's width in each mode (ADR 0004, dock; ADR 0014). Wide and narrow are the presets a
 * dragged edge snaps to; icons is the tab column alone. `hidden` is kept only so old layouts
 * parse: `normalize` turns it into icons (ADR 0009), so nothing is ever drawn at 0.
 */
const DOCK_WIDTH: Record<DockMode, number> = {
  wide: 400,
  narrow: 360,
  icons: 44,
  hidden: 0,
};

/**
 * The panel floor (ADR 0014): no stage group is ever narrower than PANEL_MIN, and no dock with
 * sections narrower than DOCK_MIN (the narrow preset, so dock tools are built for 360 px).
 * DOCK_MAX caps a dragged dock. Features are built to work from these widths up.
 */
const PANEL_MIN = 480;
const DOCK_MIN = 360;
const DOCK_MAX = 800;
/** Horizontal chrome around the groups: the stage's padding and the divider between groups. */
const STAGE_PADDING = 16;
const STAGE_DIVIDER = 8;

/** What the screen can show of a layout at a given window width. Never saved. */
export interface Fit {
  /** The dock as drawn: the layout's mode, or icons when panels need the room. */
  dock: DockMode;
  /** The dock gave way to the stage (the DM can expand it, folding the groups instead). */
  dockTrimmed: boolean;
  /** Two saved groups shown as one stack, because two panels do not fit side by side. */
  folded: boolean;
  /** Whether a second group would fit right now (split right, drag to split). */
  canSplit: boolean;
  /** Divider limits as a share of the stage, so each group keeps PANEL_MIN. */
  splitMin: number;
  splitMax: number;
  /** The widest the dock may be dragged without pushing a panel under the floor. */
  dockMax: number;
  /** Whether expanding a trimmed (or icons) dock would still leave one panel at the floor. */
  canExpandDock: boolean;
}

/**
 * Fits a layout to a window (ADR 0014). The dock gives way first: a wide or narrow dock shows
 * as icons when the panels need the room. If two groups still do not fit, they fold into one
 * stack. Nothing here changes the saved layout, so widening the window restores it exactly.
 * `dockExpanded` is the DM choosing the dock over a second panel.
 */
export function fitLayout(layout: ShellLayout, viewportWidth: number, dockExpanded = false): Fit {
  const room = Math.max(0, viewportWidth - STAGE_PADDING);
  const saved = layout.stage.groups.length;
  const want = layout.stage.maximized !== null ? 1 : saved;
  const pref = layout.dock.state === 'hidden' ? 'icons' : layout.dock.state;
  const full = pref === 'icons' ? DOCK_WIDTH.icons : layout.dock.width;
  const need = (n: number) => n * PANEL_MIN + (n - 1) * STAGE_DIVIDER;
  const fits = (n: number, dockPx: number) => room - dockPx >= need(n);

  let dock: DockMode = pref;
  let shown = want;
  if (fits(want, full)) {
    // Everything fits as saved.
  } else if (dockExpanded && pref !== 'icons' && fits(1, full)) {
    shown = 1;
  } else if (fits(want, DOCK_WIDTH.icons)) {
    dock = 'icons';
  } else {
    dock = 'icons';
    shown = 1;
  }
  const dockPx = dock === 'icons' ? DOCK_WIDTH.icons : full;
  const stage = Math.max(1, room - dockPx - STAGE_DIVIDER);
  const splitMin = Math.min(0.5, PANEL_MIN / stage);
  return {
    dock,
    dockTrimmed: dock === 'icons' && pref !== 'icons',
    folded: saved === 2 && want === 2 && shown === 1,
    canSplit: fits(2, dockPx),
    splitMin,
    splitMax: 1 - splitMin,
    dockMax: Math.max(DOCK_MIN, Math.min(DOCK_MAX, room - need(want))),
    canExpandDock: fits(1, pref === 'icons' ? DOCK_WIDTH.narrow : full),
  };
}

/** The divider position as drawn: the saved share, kept inside the fit's limits. */
export function fitSplit(split: number, fit: Fit): number {
  return Math.min(fit.splitMax, Math.max(fit.splitMin, split));
}

function sections(open: MinorKind[]): ShellLayout['dock']['sections'] {
  return MINOR_KINDS.map((tool) => ({ tool, open: open.includes(tool) }));
}

/** A fresh campaign: every major in one group, the dock wide with Scenes open. */
export function defaultLayout(): ShellLayout {
  return {
    stage: {
      groups: [{ tabs: [...MAJOR_KINDS], active: 'campaign' }],
      split: 0.5,
      maximized: null,
    },
    dock: { state: 'wide', width: 400, sections: sections(['scenes']) },
  };
}

export const STARTER_PRESETS: WorkspacePreset[] = [
  {
    name: 'Prep',
    layout: {
      stage: {
        groups: [
          { tabs: ['compendium', 'encounters', 'map'], active: 'compendium' },
          { tabs: ['campaign'], active: 'campaign' },
        ],
        split: 0.66,
        maximized: null,
      },
      dock: { state: 'narrow', width: 360, sections: sections(['scenes']) },
    },
  },
  {
    name: 'Table',
    layout: {
      stage: {
        groups: [
          { tabs: ['map'], active: 'map' },
          { tabs: ['campaign', 'encounters', 'compendium'], active: 'campaign' },
        ],
        split: 0.62,
        maximized: null,
      },
      dock: { state: 'narrow', width: 360, sections: sections(['scenes']) },
    },
  },
  {
    name: 'Combat',
    layout: {
      stage: {
        groups: [
          { tabs: ['campaign', 'compendium', 'map'], active: 'campaign' },
          { tabs: ['encounters'], active: 'encounters' },
        ],
        split: 0.5,
        maximized: null,
      },
      dock: { state: 'icons', width: 360, sections: sections(['music']) },
    },
  },
];

export function cloneLayout(layout: ShellLayout): ShellLayout {
  return {
    stage: {
      groups: layout.stage.groups.map((g) => ({ tabs: [...g.tabs], active: g.active })),
      split: layout.stage.split,
      maximized: layout.stage.maximized,
    },
    dock: {
      state: layout.dock.state,
      width: layout.dock.width,
      sections: layout.dock.sections.map((s) => ({ ...s })),
    },
  };
}

/** Which group holds a tab, or null when it is closed. */
export function groupOf(layout: ShellLayout, kind: TabKey): number | null {
  const i = layout.stage.groups.findIndex((g) => g.tabs.includes(kind));
  return i < 0 ? null : i;
}

export function isOpen(layout: ShellLayout, kind: TabKey): boolean {
  return groupOf(layout, kind) !== null;
}

/**
 * Where a deep link opens a closed tab (ADR 0017). An open tab stays where the DM put it, so
 * this returns its group. A closed one joins the only group when there is one; with two, it
 * joins the first group that holds none of `avoid` (the VTT, then a running fight), and when
 * both do, `fallback` (the focused group).
 */
export function landingGroup(
  layout: ShellLayout,
  kind: TabKey,
  avoid: readonly TabKey[],
  fallback: 0 | 1,
): 0 | 1 {
  const at = groupOf(layout, kind);
  if (at !== null) return at as 0 | 1;
  const groups = layout.stage.groups;
  if (groups.length < 2) return 0;
  for (const tab of avoid) {
    const held = groupOf(layout, tab);
    if (held !== null) return held === 0 ? 1 : 0;
  }
  return Math.min(fallback, groups.length - 1) as 0 | 1;
}

/**
 * Drops empty groups (keeping one), fixes actives, clamps maximized, and makes sure every minor
 * appears exactly once in the dock.
 */
export function normalize(layout: ShellLayout): ShellLayout {
  const next = cloneLayout(layout);
  let groups = next.stage.groups.filter((g) => g.tabs.length > 0);
  if (groups.length === 0) groups = [{ tabs: [], active: null }];
  for (const g of groups) {
    if (!g.active || !g.tabs.includes(g.active)) g.active = g.tabs[0] ?? null;
  }
  next.stage.groups = groups.slice(0, 2);
  if (next.stage.maximized !== null && next.stage.maximized >= next.stage.groups.length) {
    next.stage.maximized = null;
  }
  const seen = new Set<MinorKind>();
  const ordered = next.dock.sections.filter((s) => {
    if (seen.has(s.tool)) return false;
    seen.add(s.tool);
    return true;
  });
  for (const tool of MINOR_KINDS) {
    if (!seen.has(tool)) ordered.push({ tool, open: false });
  }
  next.dock.sections = ordered;
  next.dock.width = Math.min(DOCK_MAX, Math.max(DOCK_MIN, next.dock.width));
  // Nothing hides the dock any more (ADR 0009); a layout saved hidden shows as icons.
  if (next.dock.state === 'hidden') next.dock.state = 'icons';
  return next;
}

/** Makes `kind` the active tab of its group, opening it in `group` (default the first) if closed. */
export function openMajor(layout: ShellLayout, kind: TabKey, group?: number): ShellLayout {
  const next = cloneLayout(layout);
  const at = groupOf(next, kind);
  if (at !== null) {
    next.stage.groups[at]!.active = kind;
    return next;
  }
  const target = Math.min(group ?? 0, next.stage.groups.length - 1);
  const g = next.stage.groups[Math.max(0, target)]!;
  g.tabs.push(kind);
  g.active = kind;
  return next;
}

/** Closes a tab; its state lives on in the feature's store. A group that empties is dropped. */
export function closeTab(layout: ShellLayout, kind: TabKey): ShellLayout {
  const next = cloneLayout(layout);
  for (const g of next.stage.groups) {
    const i = g.tabs.indexOf(kind);
    if (i < 0) continue;
    g.tabs.splice(i, 1);
    if (g.active === kind) g.active = g.tabs[Math.min(i, g.tabs.length - 1)] ?? null;
  }
  return normalize(next);
}

/** Moves a tab to another group, creating the second group when needed. Never duplicates. */
export function moveTab(
  layout: ShellLayout,
  kind: TabKey,
  toGroup: 0 | 1,
  index?: number,
): ShellLayout {
  const next = cloneLayout(layout);
  const from = groupOf(next, kind);
  if (from !== null) {
    const g = next.stage.groups[from]!;
    g.tabs.splice(g.tabs.indexOf(kind), 1);
    if (g.active === kind) g.active = g.tabs[0] ?? null;
  }
  while (next.stage.groups.length <= toGroup) next.stage.groups.push({ tabs: [], active: null });
  const target = next.stage.groups[toGroup]!;
  const at =
    index === undefined ? target.tabs.length : Math.max(0, Math.min(index, target.tabs.length));
  target.tabs.splice(at, 0, kind);
  target.active = kind;
  return normalize(next);
}

/** Gives a tab its own group on the right (the ⧉ button). No-op when it is already alone there. */
export function splitRight(layout: ShellLayout, kind: TabKey): ShellLayout {
  const at = groupOf(layout, kind);
  if (at === null) return layout;
  if (at === 1 && layout.stage.groups[1]!.tabs.length === 1) return layout;
  if (layout.stage.groups.length === 1) return moveTab(layout, kind, 1);
  // Two groups already: moving into group 1 is the closest meaning.
  return at === 1 ? layout : moveTab(layout, kind, 1);
}

/** Reorders a tab within its group. */
export function reorderTab(layout: ShellLayout, kind: TabKey, index: number): ShellLayout {
  const at = groupOf(layout, kind);
  if (at === null) return layout;
  return moveTab(layout, kind, at as 0 | 1, index);
}

/** Sets the divider; `min`/`max` come from fitLayout so neither group drops under the floor. */
export function setSplit(layout: ShellLayout, split: number, min = 0.2, max = 0.8): ShellLayout {
  const next = cloneLayout(layout);
  const lo = Math.max(0.2, min);
  const hi = Math.min(0.8, max);
  next.stage.split = Math.round(Math.min(hi, Math.max(lo, split)) * 1000) / 1000;
  return next;
}

export function toggleMaximize(layout: ShellLayout, group: number): ShellLayout {
  const next = cloneLayout(layout);
  const g = Math.min(group, next.stage.groups.length - 1);
  next.stage.maximized = next.stage.maximized === g ? null : g;
  return next;
}

export function setDockMode(layout: ShellLayout, state: DockMode): ShellLayout {
  const next = cloneLayout(layout);
  next.dock.state = state;
  if (state === 'wide' || state === 'narrow') next.dock.width = DOCK_WIDTH[state];
  return next;
}

/**
 * A dragged dock edge snaps at the narrow and wide presets and collapses to icons well below
 * the floor. `max` keeps the panels at their floor (fitLayout's dockMax).
 */
export function setDockWidth(layout: ShellLayout, width: number, max = DOCK_MAX): ShellLayout {
  const next = cloneLayout(layout);
  if (width < DOCK_MIN - 80) {
    next.dock.state = 'icons';
    return next;
  }
  const near = (preset: number) => Math.abs(width - preset) < 16;
  const snapped = near(DOCK_WIDTH.narrow)
    ? DOCK_WIDTH.narrow
    : near(DOCK_WIDTH.wide)
      ? DOCK_WIDTH.wide
      : width;
  const top = Math.max(DOCK_MIN, Math.min(DOCK_MAX, max));
  next.dock.width = Math.min(top, Math.max(DOCK_MIN, Math.round(snapped)));
  next.dock.state = next.dock.width < DOCK_WIDTH.wide ? 'narrow' : 'wide';
  return next;
}

export function setSection(layout: ShellLayout, tool: MinorKind, open: boolean): ShellLayout {
  const next = cloneLayout(layout);
  const s = next.dock.sections.find((x) => x.tool === tool);
  if (s) s.open = open;
  return normalize(next);
}

export function toggleSection(layout: ShellLayout, tool: MinorKind): ShellLayout {
  const s = layout.dock.sections.find((x) => x.tool === tool);
  return setSection(layout, tool, !(s?.open ?? false));
}

export function reorderSection(layout: ShellLayout, tool: MinorKind, index: number): ShellLayout {
  const next = cloneLayout(layout);
  const i = next.dock.sections.findIndex((s) => s.tool === tool);
  if (i < 0) return layout;
  const [s] = next.dock.sections.splice(i, 1);
  next.dock.sections.splice(Math.max(0, Math.min(index, next.dock.sections.length)), 0, s!);
  return next;
}

/**
 * Applies a saved layout: it decides which tabs are open as well as where. The tabs it names
 * open in their groups; every other tab closes (its state lives on in the feature's store).
 * Web tabs the Library no longer has are dropped. The dock takes the layout's state and flags.
 */
export function applyPreset(preset: ShellLayout, webTabs: readonly WebTab[] = []): ShellLayout {
  return pruneTabs(normalize(cloneLayout(preset)), webTabs);
}

/** Whether the screen still matches a layout's intent: tabs, actives, maximize, dock state and flags. */
export function matchesPreset(current: ShellLayout, preset: ShellLayout): boolean {
  const a = normalize(current);
  const b = normalize(preset);
  if (a.stage.groups.length !== b.stage.groups.length) return false;
  for (let i = 0; i < a.stage.groups.length; i++) {
    const ga = a.stage.groups[i]!;
    const gb = b.stage.groups[i]!;
    if (ga.active !== gb.active) return false;
    if (ga.tabs.length !== gb.tabs.length || ga.tabs.some((t, j) => gb.tabs[j] !== t)) return false;
  }
  if (a.stage.maximized !== b.stage.maximized) return false;
  const trimmed = (m: DockMode) => (m === 'icons' && b.dock.state === 'narrow' ? 'narrow' : m);
  if (trimmed(a.dock.state) !== b.dock.state) return false;
  const open = (l: ShellLayout) => l.dock.sections.filter((s) => s.open).map((s) => s.tool);
  const oa = open(a);
  const ob = open(b);
  return oa.length === ob.length && oa.every((t, i) => ob[i] === t);
}

/** A short "Map / Campaign ⧉ Combat · dock narrow" line for the layouts list. */
export function describeLayout(layout: ShellLayout, webTabs: readonly WebTab[] = []): string {
  const groups = layout.stage.groups
    .map((g) => g.tabs.map((t) => tabTitle(t, webTabs)).join(' / '))
    .join(' ⧉ ');
  const open = layout.dock.sections.filter((s) => s.open).map((s) => MINOR_TITLES[s.tool]);
  // A layout saved as hidden shows as icons (normalize folds it), so describe it that way.
  const dock =
    layout.dock.state === 'icons' || layout.dock.state === 'hidden'
      ? 'dock icons'
      : `dock ${layout.dock.state}${open.length ? ': ' + open.join(', ') : ''}`;
  return `${groups} · ${dock}${layout.stage.maximized !== null ? ' · maximized' : ''}`;
}
