import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  closeTab,
  pruneTabs,
  tabTitle,
  describeLayout,
  defaultLayout,
  groupOf,
  matchesPreset,
  moveTab,
  normalize,
  openMajor,
  setDockWidth,
  splitRight,
  STARTER_PRESETS,
  toggleMaximize,
  toggleSection,
} from './shellLayout';

const table = STARTER_PRESETS[1]!.layout;

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

describe('dock', () => {
  it('snaps widths and collapses to icons when dragged small', () => {
    expect(setDockWidth(table, 390).dock).toMatchObject({ state: 'wide', width: 400 });
    expect(setDockWidth(table, 310).dock).toMatchObject({ state: 'narrow', width: 300 });
    expect(setDockWidth(table, 150).dock.state).toBe('icons');
  });

  it('shows a layout saved with a hidden dock as icons', () => {
    expect(normalize({ ...table, dock: { ...table.dock, state: 'hidden' } }).dock.state).toBe(
      'icons',
    );
  });

  it('toggles sections and keeps every minor listed once', () => {
    const layout = toggleSection(table, 'music');
    expect(layout.dock.sections.find((s) => s.tool === 'music')?.open).toBe(true);
    expect(layout.dock.sections).toHaveLength(2);
  });
});

describe('presets', () => {
  it('summons named tabs and keeps unnamed open tabs in group 1', () => {
    const current = openMajor(defaultLayout(), 'compendium');
    const applied = applyPreset(current, STARTER_PRESETS[2]!.layout);
    expect(applied.stage.groups[1]!.tabs).toEqual(['encounters']);
    expect(applied.stage.maximized).toBe(1);
    expect(applied.stage.groups[0]!.tabs).toEqual(['map', 'campaign', 'compendium']);
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
