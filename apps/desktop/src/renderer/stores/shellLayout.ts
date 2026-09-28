import {
  MAJOR_KINDS,
  MINOR_KINDS,
  type DockMode,
  type MajorKind,
  type MinorKind,
  type ShellLayout,
  type StageGroup,
  type WorkspacePreset,
} from '@trifold/schema';

/**
 * Pure layout math for the console shell (ADR 0004): a stage of one or two tab groups and a
 * dock of toggled sections. Every function returns a new layout and never leaves an empty
 * group behind when another exists.
 */

export const MAJOR_TITLES: Record<MajorKind, string> = {
  campaign: 'Campaign',
  compendium: 'Compendium',
  encounters: 'Encounters',
  map: 'Map',
};

export const MINOR_TITLES: Record<MinorKind, string> = {
  dice: 'Dice',
  tv: 'TV controls',
  music: 'Music',
  scenes: 'Scenes',
  hotkeys: 'Hotkeys',
  layouts: 'Layouts',
};

export const DOCK_WIDTH: Record<DockMode, number> = {
  wide: 400,
  narrow: 300,
  icons: 44,
  hidden: 0,
};

function sections(open: MinorKind[]): ShellLayout['dock']['sections'] {
  return MINOR_KINDS.map((tool) => ({ tool, open: open.includes(tool) }));
}

/** A fresh campaign: every major in one group, the dock wide with Dice open. */
export function defaultLayout(): ShellLayout {
  return {
    stage: {
      groups: [{ tabs: [...MAJOR_KINDS], active: 'campaign' }],
      split: 0.5,
      maximized: null,
    },
    dock: { state: 'wide', width: 400, sections: sections(['dice']) },
  };
}

export const STARTER_PRESETS: WorkspacePreset[] = [
  {
    name: 'Prep',
    layout: {
      stage: {
        groups: [
          { tabs: ['compendium', 'encounters'], active: 'compendium' },
          { tabs: ['campaign'], active: 'campaign' },
        ],
        split: 0.66,
        maximized: null,
      },
      dock: { state: 'wide', width: 400, sections: sections(['dice', 'hotkeys']) },
    },
  },
  {
    name: 'Table',
    layout: {
      stage: {
        groups: [
          { tabs: ['map', 'campaign'], active: 'map' },
          { tabs: ['encounters', 'compendium'], active: 'encounters' },
        ],
        split: 0.5,
        maximized: null,
      },
      dock: { state: 'narrow', width: 300, sections: sections(['tv', 'scenes']) },
    },
  },
  {
    name: 'Combat',
    layout: {
      stage: {
        groups: [
          { tabs: ['map', 'campaign', 'compendium'], active: 'map' },
          { tabs: ['encounters'], active: 'encounters' },
        ],
        split: 0.5,
        maximized: 1,
      },
      dock: { state: 'icons', width: 300, sections: sections(['tv']) },
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
export function groupOf(layout: ShellLayout, kind: MajorKind): number | null {
  const i = layout.stage.groups.findIndex((g) => g.tabs.includes(kind));
  return i < 0 ? null : i;
}

export function isOpen(layout: ShellLayout, kind: MajorKind): boolean {
  return groupOf(layout, kind) !== null;
}

export function activeTabs(layout: ShellLayout): Array<MajorKind | null> {
  return layout.stage.groups.map((g) => g.active);
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
  next.dock.width = Math.min(800, Math.max(200, next.dock.width));
  return next;
}

/** Makes `kind` the active tab of its group, opening it in `group` (default the first) if closed. */
export function openMajor(layout: ShellLayout, kind: MajorKind, group?: number): ShellLayout {
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
export function closeTab(layout: ShellLayout, kind: MajorKind): ShellLayout {
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
  kind: MajorKind,
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
export function splitRight(layout: ShellLayout, kind: MajorKind): ShellLayout {
  const at = groupOf(layout, kind);
  if (at === null) return layout;
  if (at === 1 && layout.stage.groups[1]!.tabs.length === 1) return layout;
  if (layout.stage.groups.length === 1) return moveTab(layout, kind, 1);
  // Two groups already: moving into group 1 is the closest meaning.
  return at === 1 ? layout : moveTab(layout, kind, 1);
}

/** Reorders a tab within its group. */
export function reorderTab(layout: ShellLayout, kind: MajorKind, index: number): ShellLayout {
  const at = groupOf(layout, kind);
  if (at === null) return layout;
  return moveTab(layout, kind, at as 0 | 1, index);
}

export function setSplit(layout: ShellLayout, split: number): ShellLayout {
  const next = cloneLayout(layout);
  next.stage.split = Math.round(Math.min(0.8, Math.max(0.2, split)) * 1000) / 1000;
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

/** A dragged dock edge snaps at 300 and 400 and collapses to icons below 200. */
export function setDockWidth(layout: ShellLayout, width: number): ShellLayout {
  const next = cloneLayout(layout);
  if (width < 200) {
    next.dock.state = 'icons';
    return next;
  }
  const snapped = Math.abs(width - 300) < 24 ? 300 : Math.abs(width - 400) < 24 ? 400 : width;
  next.dock.width = Math.min(800, Math.max(200, Math.round(snapped)));
  next.dock.state = next.dock.width <= 320 ? 'narrow' : 'wide';
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
 * Applies a saved layout: the tabs it names are summoned into their groups; open tabs it does
 * not name stay in group 1; closed tabs stay closed. The dock takes the layout's state and
 * section flags; the current section order survives when the layout lists the same tools.
 */
export function applyPreset(current: ShellLayout, preset: ShellLayout): ShellLayout {
  const next = cloneLayout(preset);
  const named = new Set(next.stage.groups.flatMap((g) => g.tabs));
  const leftovers = current.stage.groups.flatMap((g) => g.tabs).filter((t) => !named.has(t));
  const first: StageGroup = next.stage.groups[0] ?? { tabs: [], active: null };
  first.tabs.push(...leftovers);
  next.stage.groups[0] = first;
  return normalize(next);
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
export function describeLayout(layout: ShellLayout): string {
  const groups = layout.stage.groups
    .map((g) => g.tabs.map((t) => MAJOR_TITLES[t]).join(' / '))
    .join(' ⧉ ');
  const open = layout.dock.sections.filter((s) => s.open).map((s) => MINOR_TITLES[s.tool]);
  const dock =
    layout.dock.state === 'hidden'
      ? 'dock hidden'
      : layout.dock.state === 'icons'
        ? 'dock icons'
        : `dock ${layout.dock.state}${open.length ? ': ' + open.join(', ') : ''}`;
  return `${groups} · ${dock}${layout.stage.maximized !== null ? ' · maximized' : ''}`;
}
