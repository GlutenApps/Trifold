import { describe, expect, it } from 'vitest';
import type { ShellLayout } from '@trifold/schema';
import {
  applyPreset,
  isOpen,
  closeTab,
  pruneTabs,
  tabTitle,
  describeLayout,
  defaultLayout,
  fitLayout,
  fitSplit,
  groupOf,
  landingGroup,
  matchesPreset,
  moveTab,
  normalize,
  openMajor,
  setDockWidth,
  setSplit,
  splitRight,
  STARTER_PRESETS,
  toggleMaximize,
  toggleSection,
} from './shellLayout';

/** A fixed two-group layout for the stage math, independent of the starter layouts. */
const table: ShellLayout = {
  stage: {
    groups: [
      { tabs: ['map', 'campaign'], active: 'map' },
      { tabs: ['encounters', 'compendium'], active: 'encounters' },
    ],
    split: 0.5,
    maximized: null,
  },
  dock: {
    state: 'narrow',
    width: 360,
    sections: [
      { tool: 'music', open: false },
      { tool: 'scenes', open: true },
    ],
  },
};

describe('stage', () => {
  it('opens a closed major in the first group and activates an open one in place', () => {
    let layout = closeTab(defaultLayout(), 'encounters');
    expect(groupOf(layout, 'encounters')).toBeNull();
    layout = openMajor(layout, 'encounters');
    expect(groupOf(layout, 'encounters')).toBe(0);
    expect(layout.stage.groups[0]!.active).toBe('encounters');
    const again = openMajor(table, 'compendium');
    expect(again.stage.groups[1]!.active).toBe('compendium');
    expect(again.stage.groups[1]!.tabs).toEqual(['encounters', 'compendium']);
  });

  it('closing the last tab of a group drops the group and clears maximize', () => {
    const maxed = toggleMaximize(table, 1);
    expect(maxed.stage.maximized).toBe(1);
    let layout = closeTab(maxed, 'encounters');
    expect(layout.stage.groups).toHaveLength(2);
    layout = closeTab(layout, 'compendium');
    expect(layout.stage.groups).toHaveLength(1);
    expect(layout.stage.maximized).toBeNull();
  });

  it('closing the active tab activates its neighbour', () => {
    const layout = closeTab(table, 'map');
    expect(layout.stage.groups[0]!.active).toBe('campaign');
  });

  it('moves a tab between groups without duplicating it', () => {
    const layout = moveTab(table, 'compendium', 0, 0);
    expect(layout.stage.groups[0]!.tabs).toEqual(['compendium', 'map', 'campaign']);
    expect(layout.stage.groups[1]!.tabs).toEqual(['encounters']);
    expect(layout.stage.groups[0]!.active).toBe('compendium');
  });

  it('splits a tab into its own group on the right and caps at two groups', () => {
    const layout = splitRight(defaultLayout(), 'encounters');
    expect(layout.stage.groups).toHaveLength(2);
    expect(layout.stage.groups[1]!.tabs).toEqual(['encounters']);
    expect(splitRight(layout, 'encounters')).toBe(layout);
    const more = splitRight(layout, 'map');
    expect(more.stage.groups).toHaveLength(2);
    expect(more.stage.groups[1]!.tabs).toEqual(['encounters', 'map']);
  });
});

describe('landingGroup (ADR 0017)', () => {
  it('keeps an open tab where it is', () => {
    expect(landingGroup(table, 'campaign', ['map'], 1)).toBe(0);
    expect(landingGroup(table, 'encounters', ['map'], 0)).toBe(1);
  });

  it('puts a closed tab in the only group, else away from the VTT', () => {
    expect(landingGroup(closeTab(defaultLayout(), 'compendium'), 'compendium', ['map'], 1)).toBe(0);
    // `table` has the VTT in group 0, so a closed tab lands in group 1 whatever is focused.
    expect(landingGroup(closeTab(table, 'compendium'), 'compendium', ['map'], 0)).toBe(1);
  });

  it('falls through the avoid list, then to the focused group', () => {
    const noMap = closeTab(table, 'map');
    expect(noMap.stage.groups).toHaveLength(2);
    expect(landingGroup(noMap, 'map', ['map', 'encounters'], 1)).toBe(0);
    expect(landingGroup(noMap, 'map', ['map'], 1)).toBe(1);
    expect(landingGroup(noMap, 'map', [], 0)).toBe(0);
  });
});

describe('dock', () => {
  it('snaps widths, keeps the 360 floor and collapses to icons when dragged small', () => {
    expect(setDockWidth(table, 390).dock).toMatchObject({ state: 'wide', width: 400 });
    expect(setDockWidth(table, 350).dock).toMatchObject({ state: 'narrow', width: 360 });
    expect(setDockWidth(table, 300).dock).toMatchObject({ state: 'narrow', width: 360 });
    expect(setDockWidth(table, 250).dock.state).toBe('icons');
  });

  it('never drags wider than the panels allow', () => {
    expect(setDockWidth(table, 700, 520).dock.width).toBe(520);
    expect(setDockWidth(table, 700, 200).dock.width).toBe(360);
  });

  it('lifts a dock saved under the floor to 360', () => {
    expect(normalize({ ...table, dock: { ...table.dock, width: 300 } }).dock.width).toBe(360);
  });

  it('shows a layout saved with a hidden dock as icons', () => {
    expect(normalize({ ...table, dock: { ...table.dock, state: 'hidden' } }).dock.state).toBe(
      'icons',
    );
  });

  it('toggles sections and keeps every minor listed once', () => {
    const layout = toggleSection(table, 'music');
    expect(layout.dock.sections.find((s) => s.tool === 'music')?.open).toBe(true);
    // `table` was saved before Quick notes existed: it gains the tool, closed, once (ADR 0018).
    expect(layout.dock.sections.map((s) => s.tool).sort()).toEqual([
      'music',
      'quickNotes',
      'scenes',
    ]);
    expect(layout.dock.sections.find((s) => s.tool === 'quickNotes')?.open).toBe(false);
  });
});

describe('presets', () => {
  it('opens exactly the tabs a layout names and closes the rest', () => {
    const notes = {
      id: '01A',
      title: 'Notes',
      url: 'https://example.com',
      autoTitle: false,
      icon: 'tome' as const,
      zoom: 1,
    };
    const prep: ShellLayout = {
      ...STARTER_PRESETS[0]!.layout,
      stage: {
        ...STARTER_PRESETS[0]!.layout.stage,
        groups: [
          { tabs: ['compendium', 'web:01A'], active: 'web:01A' },
          { tabs: ['web:gone'], active: 'web:gone' },
        ],
      },
    };
    // A custom layout with a web tab, then a starter that does not name it: the web tab closes.
    const custom = applyPreset(prep, [notes]);
    expect(custom.stage.groups).toEqual([{ tabs: ['compendium', 'web:01A'], active: 'web:01A' }]);
    const combat = applyPreset(STARTER_PRESETS[2]!.layout, [notes]);
    expect(combat.stage.groups.flatMap((g) => g.tabs)).not.toContain('web:01A');
    expect(combat.stage.groups[1]!.tabs).toEqual(['encounters']);
    // A layout that leaves out a major closes it too.
    const noMap = applyPreset({
      ...table,
      stage: { ...table.stage, groups: [{ tabs: ['campaign'], active: 'campaign' }] },
    });
    expect(isOpen(noMap, 'map')).toBe(false);
  });

  it('matches on intent: a narrow dock trimmed to icons still counts', () => {
    expect(matchesPreset(table, table)).toBe(true);
    expect(matchesPreset({ ...table, dock: { ...table.dock, state: 'icons' } }, table)).toBe(true);
    expect(matchesPreset(toggleSection(table, 'music'), table)).toBe(false);
    expect(matchesPreset(openMajor(table, 'compendium'), table)).toBe(false);
  });
});

describe('web tabs (ADR 0011)', () => {
  const docs = {
    id: '01A',
    title: 'Session notes',
    url: 'https://example.com',
    autoTitle: true,
    icon: 'tome' as const,
    zoom: 1,
  };

  it('opens, moves and closes a web tab like a major', () => {
    let layout = openMajor(defaultLayout(), 'web:01A');
    expect(groupOf(layout, 'web:01A')).toBe(0);
    layout = moveTab(layout, 'web:01A', 1);
    expect(groupOf(layout, 'web:01A')).toBe(1);
    expect(layout.stage.groups[1]!.active).toBe('web:01A');
    layout = closeTab(layout, 'web:01A');
    expect(groupOf(layout, 'web:01A')).toBeNull();
    expect(layout.stage.groups).toHaveLength(1);
  });

  it('titles a web tab from the list and falls back when it is gone', () => {
    expect(tabTitle('web:01A', [docs])).toBe('Session notes');
    expect(tabTitle('web:zzz', [docs])).toBe('Web tab');
    expect(tabTitle('campaign', [docs])).toBe('Campaign');
    expect(describeLayout(openMajor(defaultLayout(), 'web:01A'), [docs])).toContain(
      'Session notes',
    );
  });

  it('prunes web tabs the Library no longer has and leaves others untouched', () => {
    const layout = openMajor(openMajor(defaultLayout(), 'web:01A'), 'web:gone');
    const pruned = pruneTabs(layout, [docs]);
    expect(groupOf(pruned, 'web:01A')).toBe(0);
    expect(groupOf(pruned, 'web:gone')).toBeNull();
    expect(pruneTabs(pruned, [docs])).toBe(pruned);
  });
});

describe('fit (ADR 0014)', () => {
  // Table: two groups, narrow dock (360).
  it('shows the layout as saved when everything fits', () => {
    for (const width of [1600, 1366]) {
      const fit = fitLayout(table, width);
      expect(fit).toMatchObject({
        dock: 'narrow',
        dockTrimmed: false,
        folded: false,
        canSplit: true,
      });
    }
  });

  it('folds the dock to icons before it folds the groups', () => {
    expect(fitLayout(table, 1280)).toMatchObject({
      dock: 'icons',
      dockTrimmed: true,
      folded: false,
    });
  });

  it('folds two groups into one stack when two panels cannot fit (half of a 1920 screen)', () => {
    const fit = fitLayout(table, 960);
    expect(fit).toMatchObject({ dock: 'icons', folded: true, canSplit: false });
  });

  it('lets the DM keep the dock and fold the groups instead, while one panel still fits', () => {
    expect(fitLayout(table, 960, true)).toMatchObject({ dock: 'narrow', folded: true });
    expect(fitLayout(table, 960).canExpandDock).toBe(true);
    expect(fitLayout(table, 720, true)).toMatchObject({ dock: 'icons', folded: true });
    expect(fitLayout(table, 720).canExpandDock).toBe(false);
  });

  it('never folds a single group or a maximized one', () => {
    expect(fitLayout(defaultLayout(), 720).folded).toBe(false);
    expect(fitLayout(toggleMaximize(table, 1), 720).folded).toBe(false);
  });

  it('keeps both groups at the floor when the divider is dragged', () => {
    const fit = fitLayout(table, 1600);
    // Stage: 1600 - 16 padding - 360 dock - 8 divider = 1216; 480 / 1216.
    expect(fit.splitMin).toBeCloseTo(480 / 1216, 3);
    expect(fitSplit(0.2, fit)).toBeCloseTo(fit.splitMin, 3);
    expect(setSplit(table, 0.2, fit.splitMin, fit.splitMax).stage.split).toBeCloseTo(0.395, 3);
    expect(setSplit(table, 0.9, fit.splitMin, fit.splitMax).stage.split).toBeCloseTo(0.605, 3);
  });

  it('caps the dock drag so the saved groups keep their floor', () => {
    // 1600 - 16 - (2 x 480 + 8) = 616.
    expect(fitLayout(table, 1600).dockMax).toBe(616);
    expect(fitLayout(defaultLayout(), 1600).dockMax).toBe(800);
  });
});
