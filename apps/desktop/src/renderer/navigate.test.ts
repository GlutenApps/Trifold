import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShellLayout } from '@trifold/schema';
import { useCombatStore } from './stores/combatStore';
import { closeTab, defaultLayout, groupOf } from './stores/shellLayout';
import { useShellStore } from './stores/shellStore';
import { homeOf, landOn, navigate, selectPhrase, useNavStore, useNavTarget } from './navigate';

/** Two groups: VTT alone on the left, the rest on the right. */
function tableLayout(): ShellLayout {
  const layout = defaultLayout();
  layout.stage.groups = [
    { tabs: ['map'], active: 'map' },
    { tabs: ['campaign', 'encounters', 'compendium'], active: 'campaign' },
  ];
  return layout;
}

describe('navigate', () => {
  beforeEach(() => {
    useShellStore.setState({
      space: 'console',
      campaignSlug: 'c',
      layout: tableLayout(),
      focusedGroup: 0,
      pop: 'search',
      flyout: null,
      viewportWidth: 1600,
    });
    useNavStore.setState({ pending: null });
    useCombatStore.setState({ encounterId: null });
  });

  it('maps every type to a tab or a dock tool', () => {
    expect(homeOf({ type: 'note', id: 'n' })).toEqual({ tab: 'campaign' });
    expect(homeOf({ type: 'npc', id: 'n' })).toEqual({ tab: 'campaign' });
    expect(homeOf({ type: 'encounter', id: 'e' })).toEqual({ tab: 'encounters' });
    expect(homeOf({ type: 'record', id: 'r' })).toEqual({ tab: 'compendium' });
    expect(homeOf({ type: 'scene', id: 's' })).toEqual({ tool: 'scenes' });
    expect(homeOf({ type: 'webTab', id: 'w' })).toEqual({ tab: 'web:w' });
  });

  it('brings an open tab forward in place, closes the pop-up and posts the target', () => {
    navigate({ type: 'npc', id: 'n1' });
    const { layout, pop } = useShellStore.getState();
    expect(layout.stage.groups[1]!.active).toBe('campaign');
    expect(groupOf(layout, 'campaign')).toBe(1);
    expect(pop).toBeNull();
    expect(useNavStore.getState().pending?.target).toEqual({ type: 'npc', id: 'n1' });
  });

  it('opens a closed tab away from the VTT', () => {
    useShellStore.setState({ layout: closeTab(tableLayout(), 'compendium'), focusedGroup: 0 });
    navigate({ type: 'record', id: 'r1' });
    expect(groupOf(useShellStore.getState().layout, 'compendium')).toBe(1);
  });

  it('keeps a closed tab away from a running fight when the VTT is closed', () => {
    let layout = closeTab(tableLayout(), 'map');
    layout.stage.groups = [
      { tabs: ['campaign'], active: 'campaign' },
      { tabs: ['encounters'], active: 'encounters' },
    ];
    layout = closeTab(layout, 'compendium');
    useShellStore.setState({ layout, focusedGroup: 1 });
    useCombatStore.setState({ encounterId: 'fight' });
    navigate({ type: 'record', id: 'r1' });
    expect(groupOf(useShellStore.getState().layout, 'compendium')).toBe(0);
  });

  it('opens a scene through the dock tool and a web tab with nothing pending', () => {
    navigate({ type: 'scene', id: 's1' });
    expect(
      useShellStore.getState().layout.dock.sections.find((s) => s.tool === 'scenes')?.open,
    ).toBe(true);
    expect(useNavStore.getState().pending?.target.type).toBe('scene');
    useNavStore.setState({ pending: null });
    useShellStore.setState({
      webTabs: [
        { id: 'w1', title: 'Rules', url: 'https://x', autoTitle: false, icon: 'globe', zoom: 1 },
      ],
    });
    navigate({ type: 'webTab', id: 'w1' });
    expect(groupOf(useShellStore.getState().layout, 'web:w1')).not.toBeNull();
    expect(useNavStore.getState().pending).toBeNull();
  });

  it('does nothing in the Library', () => {
    useShellStore.setState({ space: 'library' });
    navigate({ type: 'npc', id: 'n1' });
    expect(useNavStore.getState().pending).toBeNull();
  });
});

describe('useNavTarget', () => {
  beforeEach(() => {
    useNavStore.setState({ pending: null });
  });

  it('runs for its types only, and clears the target when the handler lands it', () => {
    const notes = vi.fn(() => true);
    const npcs = vi.fn(() => true);
    renderHook(() => useNavTarget(['note', 'folder'], notes));
    renderHook(() => useNavTarget('npc', npcs));
    act(() => useNavStore.setState({ pending: { target: { type: 'note', id: 'n1' }, seq: 1 } }));
    expect(notes).toHaveBeenCalledWith({ type: 'note', id: 'n1' });
    expect(npcs).not.toHaveBeenCalled();
    expect(useNavStore.getState().pending).toBeNull();
  });

  it('leaves the target for a later panel when the handler only switches towards it', () => {
    const page = vi.fn(() => false);
    renderHook(() => useNavTarget('note', page));
    act(() => useNavStore.setState({ pending: { target: { type: 'note', id: 'n1' }, seq: 2 } }));
    expect(page).toHaveBeenCalled();
    expect(useNavStore.getState().pending?.seq).toBe(2);
    // The inner panel mounts afterwards and finds the target still waiting.
    const inner = vi.fn(() => true);
    renderHook(() => useNavTarget('note', inner));
    expect(inner).toHaveBeenCalledWith({ type: 'note', id: 'n1' });
    expect(useNavStore.getState().pending).toBeNull();
  });
});

describe('landOn and selectPhrase', () => {
  it('flashes every marked element once it exists', async () => {
    vi.useFakeTimers();
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => window.setTimeout(() => cb(0), 16));
    landOn('npc:n1');
    const row = document.createElement('div');
    row.dataset['nav'] = 'npc:n1';
    document.body.append(row);
    vi.advanceTimersByTime(16);
    expect(row.classList.contains('nav-flash')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(row.classList.contains('nav-flash')).toBe(false);
    row.remove();
    raf.mockRestore();
    vi.useRealTimers();
  });

  it('selects the nth occurrence of a phrase in a text field', () => {
    const field = document.createElement('textarea');
    field.value = 'Hesper waits. Then Hesper leaves.';
    document.body.append(field);
    selectPhrase(field, 'hesper', 1);
    expect(field.selectionStart).toBe(19);
    expect(field.selectionEnd).toBe(25);
    selectPhrase(field, 'hesper', 5);
    expect(field.selectionStart).toBe(19);
    field.remove();
  });
});
