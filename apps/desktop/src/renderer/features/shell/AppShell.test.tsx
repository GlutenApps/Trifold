import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useShellStore } from '../../stores/shellStore';
import { defaultLayout } from '../../stores/shellLayout';
import { AppShell } from './AppShell';

function bundle(): CampaignBundle {
  const now = '2026-09-28T00:00:00.000Z';
  return {
    campaign: {
      schemaVersion: 1,
      id: 'c1',
      slug: 'sunken-keep',
      name: 'Sunken Keep',
      preferredEdition: '2024',
      settings: {},
      createdAt: now,
      updatedAt: now,
    } as CampaignBundle['campaign'],
    pcs: [],
    adventures: [],
    notes: [],
    npcs: [],
    encounters: [],
    scenes: [],
  } as unknown as CampaignBundle;
}

function openCampaign() {
  const summary = {
    id: 'c1',
    slug: 'sunken-keep',
    name: 'Sunken Keep',
    pcCount: 0,
    encounterCount: 0,
    updatedAt: '2026-09-28T00:00:00.000Z',
  } as never;
  // The shell reloads campaigns on mount; the bridge must agree that one is open.
  window.trifold.campaigns.current = vi.fn(async () => bundle());
  window.trifold.campaigns.list = vi.fn(async () => [summary]);
  act(() => {
    useCampaignStore.setState({ current: bundle(), campaigns: [summary] });
  });
}

function group(n: number) {
  return within(screen.getByRole('region', { name: `Stage group ${n}` }));
}

describe('AppShell', () => {
  beforeEach(() => {
    useShellStore.setState({
      space: 'library',
      libraryPage: 'campaigns',
      campaignSlug: null,
      layout: defaultLayout(),
      focusedGroup: 0,
      presets: [],
      consoles: {},
      flyout: null,
      pop: null,
      draggingTab: null,
      splitHover: false,
      focusedTab: null,
      closePrompt: false,
      viewportWidth: 1600,
      dockExpanded: false,
      hydratedFor: null,
    });
    useCampaignStore.setState({ current: null, campaigns: [] });
    // Stores are module singletons: a previous test's Library must not seed this one.
    useAppStore.setState({ library: null });
  });

  it('starts in the Library and loads app state', async () => {
    render(<AppShell />);
    expect(screen.getByTestId('library')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Library' })).toHaveTextContent('Campaigns');
    expect(screen.queryByTestId('live-strip')).not.toBeInTheDocument();
    await waitFor(() => expect(window.trifold.library.getInfo).toHaveBeenCalled());
  });

  it('enters the console when a campaign opens, with every major as a tab', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Stage group 1' })).toBeInTheDocument(),
    );
    // Only the stage strip's tabs: the Campaign major has sub-tabs of its own.
    const tabs = within(group(1).getByRole('tablist', { name: 'Stage group 1 tabs' })).getAllByRole(
      'tab',
    );
    expect(tabs.map((t) => t.textContent)).toEqual(['Campaign', 'Compendium', 'Encounters', 'VTT']);
    expect(screen.getByTestId('live-strip')).toBeInTheDocument();
    expect(screen.getByTestId('topbar')).toHaveTextContent('Sunken Keep');
  });

  it('switches tabs without unmounting them and closes from the tab', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Stage group 1' })).toBeInTheDocument(),
    );
    const panel = (kind: string) =>
      document.querySelector<HTMLElement>(`.grp-body[data-major="${kind}"]`)!;
    expect(panel('compendium').hidden).toBe(true);
    await userEvent.click(group(1).getByRole('tab', { name: 'Compendium' }));
    expect(panel('compendium').hidden).toBe(false);
    expect(panel('campaign').hidden).toBe(true);
    // The Campaign tab is still mounted, just hidden: its state survives.
    expect(panel('campaign')).toBeInTheDocument();

    await userEvent.click(group(1).getByRole('button', { name: 'Close Encounters tab' }));
    expect(group(1).queryByRole('tab', { name: 'Encounters' })).not.toBeInTheDocument();
    expect(useShellStore.getState().layout.stage.groups[0]!.tabs).not.toContain('encounters');
  });

  it('splits a tab into a second group and maximizes it', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Stage group 1' })).toBeInTheDocument(),
    );
    await userEvent.click(group(1).getByRole('tab', { name: 'Encounters' }));
    // Dragging a tab past the stage's middle is the gesture; it lands in moveTab(kind, 1).
    act(() => useShellStore.getState().moveTab('encounters', 1));
    expect(screen.getByRole('region', { name: 'Stage group 2' })).toBeInTheDocument();
    expect(group(2).getByRole('tab', { name: 'Encounters' })).toBeInTheDocument();
    await userEvent.click(group(2).getByRole('button', { name: 'Maximize group' }));
    expect(screen.queryByRole('region', { name: 'Stage group 1' })).not.toBeInTheDocument();
    await userEvent.click(group(2).getByRole('button', { name: 'Restore groups' }));
    expect(screen.getByRole('region', { name: 'Stage group 1' })).toBeInTheDocument();
  });

  it('never offers a major from + that is open in either group', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Stage group 1' })).toBeInTheDocument(),
    );
    const add = (n: number) => group(n).getByRole('button', { name: `Add a tab to group ${n}` });
    const offered = async (n: number) => {
      await userEvent.click(add(n));
      const names = within(screen.getByRole('menu', { name: 'Tabs' }))
        .getAllByRole('menuitem')
        .map((b) => b.textContent);
      // The button toggles: a second click closes the menu again.
      await userEvent.click(add(n));
      return names;
    };
    // Every major is open in group 1, so + offers only a new web tab (ADR 0011).
    expect(await offered(1)).toEqual(['New web tab…']);
    await userEvent.click(group(1).getByRole('tab', { name: 'Encounters' }));
    // Dragging a tab past the stage's middle is the gesture; it lands in moveTab(kind, 1).
    act(() => useShellStore.getState().moveTab('encounters', 1));
    // Encounters now lives in group 2; neither strip offers it or any other major.
    expect(await offered(1)).toEqual(['New web tab…']);
    expect(await offered(2)).toEqual(['New web tab…']);

    await userEvent.click(group(1).getByRole('button', { name: 'Close Compendium tab' }));
    expect(await offered(2)).toEqual(['Compendium', 'New web tab…']);
  }, 15_000);

  it('spreads a lone group across the stage when the other side empties', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Stage group 1' })).toBeInTheDocument(),
    );
    const grow = (n: number) =>
      screen.getByRole('region', { name: `Stage group ${n}` }).style.flexGrow;
    expect(grow(1)).toBe('1');
    await userEvent.click(group(1).getByRole('tab', { name: 'Encounters' }));
    // Dragging a tab past the stage's middle is the gesture; it lands in moveTab(kind, 1).
    act(() => useShellStore.getState().moveTab('encounters', 1));
    expect(grow(1)).toBe('0.5');
    await userEvent.click(group(2).getByRole('button', { name: 'Close Encounters tab' }));
    expect(screen.queryByRole('region', { name: 'Stage group 2' })).not.toBeInTheDocument();
    expect(grow(1)).toBe('1');
  });

  it('toggles dock tools and collapses to icons with flyouts', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(screen.getByTestId('dock')).toBeInTheDocument());
    const dock = () => within(screen.getByTestId('dock'));
    expect(dock().getByRole('region', { name: 'Scenes' })).toBeInTheDocument();
    await userEvent.click(dock().getByRole('button', { name: 'Scenes tool' }));
    expect(dock().queryByRole('region', { name: 'Scenes' })).not.toBeInTheDocument();
    await userEvent.click(dock().getByRole('button', { name: 'Scenes tool' }));
    expect(dock().getByRole('region', { name: 'Scenes' })).toBeInTheDocument();
    // Dice, Hotkeys and Layouts are pop-ups now, not dock tools (ADR 0009).
    expect(dock().queryByRole('button', { name: 'Dice tool' })).not.toBeInTheDocument();
    expect(dock().queryByRole('button', { name: 'Hotkeys tool' })).not.toBeInTheDocument();

    await userEvent.click(dock().getByRole('button', { name: 'Collapse dock to icons' }));
    expect(dock().queryByRole('region', { name: 'Scenes' })).not.toBeInTheDocument();
    await userEvent.click(dock().getByRole('button', { name: 'Scenes tool' }));
    expect(screen.getByRole('dialog', { name: 'Scenes' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Scenes' })).not.toBeInTheDocument();

    // The top bar no longer hides the dock; collapsing to icons is the dock's own job.
    expect(screen.queryByRole('button', { name: 'Hide dock' })).not.toBeInTheDocument();
  });

  it('pops Dice up from the strip and Hotkeys and Layouts from the top bar, one at a time', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(screen.getByTestId('live-strip')).toBeInTheDocument());
    const strip = within(screen.getByTestId('live-strip'));
    await userEvent.click(strip.getByRole('button', { name: 'Dice' }));
    expect(screen.getByRole('dialog', { name: 'Dice' })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: 'Dice' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(strip.getByRole('button', { name: 'Dice' }));
    expect(screen.queryByRole('dialog', { name: 'Dice' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Control>}d{/Control}');
    expect(screen.getByRole('dialog', { name: 'Dice' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hotkeys' }));
    expect(screen.getByRole('dialog', { name: 'Hotkeys' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Dice' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Layouts' }));
    expect(screen.getByRole('dialog', { name: 'Layouts' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Hotkeys' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.keyboard('{Control>}/{/Control}');
    expect(screen.getByRole('dialog', { name: 'Hotkeys' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close pop-up' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rolls the shared pool from the strip and finds it in the Dice tool log', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(screen.getByTestId('live-strip')).toBeInTheDocument());
    const strip = within(screen.getByTestId('live-strip'));
    await userEvent.click(strip.getByRole('button', { name: 'Add d6 (tray)' }));
    await userEvent.click(strip.getByRole('button', { name: 'Add d6 (tray)' }));
    await userEvent.click(strip.getByRole('button', { name: 'Roll the pool (tray)' }));
    // The tray total tumbles through stand-in faces; a click settles it on the real roll.
    const result = strip.getByLabelText('Last roll');
    await userEvent.click(within(result).getByTestId('roll-reveal'));
    expect(within(result).getByTestId('roll-reveal')).toHaveAttribute('data-settled', 'true');
    const total = Number(result.textContent);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(12);
    await userEvent.click(strip.getByRole('button', { name: 'Dice' }));
    expect(screen.getByRole('list', { name: 'Roll log' })).toHaveTextContent('2d6');
    expect(screen.getByRole('list', { name: 'Roll log' })).toHaveTextContent('pool');
  });

  it('applies, saves and deletes layouts, including the starters', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(useShellStore.getState().hydratedFor).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Layouts' }));
    const list = () => within(screen.getByRole('list', { name: 'Layouts' }));
    await userEvent.click(list().getByRole('button', { name: 'Apply layout Table' }));
    expect(group(1).getByRole('tab', { name: 'VTT' })).toHaveAttribute('aria-selected', 'true');
    expect(group(2).getByRole('tab', { name: 'Encounters' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('topbar')).toHaveTextContent('Table');

    // The pop-up stays open across an apply, so the DM can try several in a row.
    await userEvent.type(screen.getByLabelText('New layout name'), 'Fight night{Enter}');
    expect(list().getByRole('button', { name: 'Apply layout Fight night' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(list().getByRole('button', { name: 'Delete layout Prep' }));
    expect(list().getByRole('button', { name: 'Apply layout Prep' })).toBeInTheDocument();
    await userEvent.click(list().getByRole('button', { name: 'Delete' }));
    expect(list().queryByRole('button', { name: 'Apply layout Prep' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Control>}1{/Control}');
    expect(useShellStore.getState().presets[0]!.name).toBe('Table');
    await waitFor(
      () =>
        expect(window.trifold.library.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ workspace: expect.objectContaining({ seeded: true }) }),
        ),
      { timeout: 2000 },
    );
  });

  it('Ctrl+K brings the compendium forward where it is, or opens it away from combat', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(useShellStore.getState().hydratedFor).not.toBeNull());
    // Table: Compendium sits beside Encounters in group 2, so it comes forward there.
    act(() => useShellStore.getState().applyLayout(1));
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(group(2).getByRole('tab', { name: 'Compendium' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Closed, it opens in the group that does not hold Encounters (the tracker).
    act(() => useShellStore.getState().closeTab('compendium'));
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(group(1).getByRole('tab', { name: 'Compendium' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(group(2).getByRole('tab', { name: 'Encounters' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('returns to the Library and back without losing the console', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Stage group 1' })).toBeInTheDocument(),
    );
    await userEvent.click(group(1).getByRole('tab', { name: 'VTT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByTestId('library')).toBeInTheDocument();
    expect(screen.getByTestId('live-strip')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back to Sunken Keep/ }));
    expect(group(1).getByRole('tab', { name: 'VTT' })).toHaveAttribute('aria-selected', 'true');
  });

  it('toggles blackout from the hotkey and pushes to main', async () => {
    render(<AppShell />);
    openCampaign();
    await userEvent.keyboard('{Control>}{Shift>}b{/Shift}{/Control}');
    expect(window.trifold.presenter.push).toHaveBeenCalledWith(
      expect.objectContaining({ blackout: false }),
    );
    vi.clearAllMocks();
  });
});
