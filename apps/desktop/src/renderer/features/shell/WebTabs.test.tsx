import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleKeydown } from '../../hotkeys';
import { defaultLayout } from '../../stores/shellLayout';
import { useShellStore } from '../../stores/shellStore';
import { Stage } from './Stage';

/** Web tabs on the stage (ADR 0011): added from the + menu, parked by ×, forgotten by Remove. */

function strip(n: number) {
  return within(screen.getByRole('tablist', { name: `Stage group ${n} tabs` }));
}

function bar(name: string) {
  return within(screen.getByRole('toolbar', { name: `${name} controls` }));
}

beforeEach(() => {
  act(() => {
    useShellStore.setState({
      space: 'console',
      campaignSlug: 'sunken-keep',
      layout: defaultLayout(),
      webTabs: [],
      presets: [],
      consoles: {},
      focusedGroup: 0,
    });
  });
});

describe('web tabs', () => {
  it('adds a named web tab with an icon from the + menu and persists it', async () => {
    const user = userEvent.setup();
    render(<Stage />);
    await user.click(strip(1).getByRole('button', { name: 'Add a tab to group 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'New web tab…' }));
    await user.type(screen.getByRole('textbox', { name: 'Tab name' }), 'Session notes');
    await user.type(screen.getByRole('textbox', { name: 'Web address' }), 'example.com/notes');
    await user.click(screen.getByRole('radio', { name: 'Book' }));
    await user.click(screen.getByRole('button', { name: 'Add web tab' }));

    const tab = strip(1).getByRole('tab', { name: 'Session notes' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Session notes' })).toBeInTheDocument();
    const [saved] = useShellStore.getState().webTabs;
    expect(saved).toMatchObject({
      title: 'Session notes',
      url: 'https://example.com/notes',
      autoTitle: false,
      icon: 'tome',
    });

    await vi.waitFor(() => {
      expect(window.trifold.library.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({ webTabs: [saved] }),
        }),
      );
    });
  });

  it('names a tab after its host when no name is given, and follows the page title', async () => {
    const user = userEvent.setup();
    render(<Stage />);
    await user.click(strip(1).getByRole('button', { name: 'Add a tab to group 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'New web tab…' }));
    await user.type(screen.getByRole('textbox', { name: 'Web address' }), 'example.com/notes');
    await user.keyboard('{Enter}');
    expect(strip(1).getByRole('tab', { name: 'example.com' })).toBeInTheDocument();
    expect(useShellStore.getState().webTabs[0]).toMatchObject({
      title: 'example.com',
      autoTitle: true,
      icon: 'globe',
    });
  });

  it('refuses an address that is not a web page', async () => {
    const user = userEvent.setup();
    render(<Stage />);
    await user.click(strip(1).getByRole('button', { name: 'Add a tab to group 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'New web tab…' }));
    await user.type(screen.getByRole('textbox', { name: 'Web address' }), 'file:///C:/x.txt');
    expect(screen.getByRole('button', { name: 'Add web tab' })).toBeDisabled();
    expect(useShellStore.getState().webTabs).toHaveLength(0);
  });

  it('closing parks the tab in the + menu; removing forgets it', async () => {
    const user = userEvent.setup();
    act(() => {
      useShellStore.getState().addWebTab({ url: 'https://example.com/sheet' }, 0);
    });
    render(<Stage />);
    await user.click(strip(1).getByRole('button', { name: 'Close example.com tab' }));
    expect(strip(1).queryByRole('tab', { name: 'example.com' })).toBeNull();

    await user.click(strip(1).getByRole('button', { name: 'Add a tab to group 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'example.com' }));
    expect(strip(1).getByRole('tab', { name: 'example.com' })).toBeInTheDocument();

    await user.click(bar('example.com').getByRole('button', { name: 'Remove web tab' }));
    await user.click(bar('example.com').getByRole('button', { name: 'Confirm remove web tab' }));
    expect(useShellStore.getState().webTabs).toHaveLength(0);
    expect(strip(1).queryByRole('tab', { name: 'example.com' })).toBeNull();
  });

  it('edits the name, saved address and icon from the pencil panel', async () => {
    const user = userEvent.setup();
    act(() => {
      useShellStore.getState().addWebTab({ url: 'https://example.com/sheet' }, 0);
    });
    render(<Stage />);
    await user.click(bar('example.com').getByRole('button', { name: 'Edit tab' }));
    const panel = within(screen.getByRole('group', { name: 'Edit web tab' }));
    await user.type(panel.getByRole('textbox', { name: 'Tab name' }), 'Party sheet');
    await user.clear(panel.getByRole('textbox', { name: 'Saved address' }));
    await user.type(panel.getByRole('textbox', { name: 'Saved address' }), 'example.com/party');
    await user.click(panel.getByRole('radio', { name: 'Person' }));
    await user.click(panel.getByRole('button', { name: 'Save' }));

    expect(useShellStore.getState().webTabs[0]).toMatchObject({
      title: 'Party sheet',
      autoTitle: false,
      url: 'https://example.com/party',
      icon: 'person',
    });
    expect(strip(1).getByRole('tab', { name: 'Party sheet' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Edit web tab' })).toBeNull();

    // An empty name hands the title back to the page.
    await user.click(bar('Party sheet').getByRole('button', { name: 'Edit tab' }));
    await user.clear(screen.getByRole('textbox', { name: 'Tab name' }));
    await user.keyboard('{Enter}');
    expect(useShellStore.getState().webTabs[0]?.autoTitle).toBe(true);
  });

  it('browsing inside the tab never changes the saved address; Home returns to it', async () => {
    const user = userEvent.setup();
    act(() => {
      useShellStore.getState().addWebTab({ url: 'https://example.com/home' }, 0);
    });
    render(<Stage />);
    const home = () => bar('example.com').getByRole('button', { name: 'Home' });
    expect(home()).toBeDisabled();

    const address = bar('example.com').getByRole('textbox', { name: 'Address' });
    await user.click(address);
    await user.clear(address);
    await user.type(address, 'example.com/elsewhere{Enter}');
    expect(address).toHaveValue('https://example.com/elsewhere');
    expect(useShellStore.getState().webTabs[0]?.url).toBe('https://example.com/home');
    expect(home()).toBeEnabled();

    // "Use current page" is how the saved address moves.
    await user.click(bar('example.com').getByRole('button', { name: 'Edit tab' }));
    await user.click(screen.getByRole('button', { name: 'Use current page' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(useShellStore.getState().webTabs[0]?.url).toBe('https://example.com/elsewhere');
    expect(home()).toBeDisabled();
  });

  it('a removed tab disappears from saved layouts too', () => {
    const key = useShellStore.getState().addWebTab({ url: 'https://example.com/a' }, 0);
    act(() => {
      useShellStore.getState().savePreset('With docs');
    });
    expect(useShellStore.getState().presets[0]!.layout.stage.groups[0]!.tabs).toContain(key);
    act(() => {
      useShellStore.getState().removeWebTab(useShellStore.getState().webTabs[0]!.id);
    });
    expect(useShellStore.getState().presets[0]!.layout.stage.groups[0]!.tabs).not.toContain(key);
  });
});

describe('web tab zoom', () => {
  it('steps, resets, answers the Ctrl combos, and is saved per tab', async () => {
    const user = userEvent.setup();
    act(() => {
      useShellStore.getState().addWebTab({ url: 'https://example.com/a' }, 0);
    });
    render(<Stage />);
    const zoom = () => useShellStore.getState().webTabs[0]!.zoom;
    await user.click(bar('example.com').getByRole('button', { name: 'Zoom in' }));
    await user.click(bar('example.com').getByRole('button', { name: 'Zoom in' }));
    expect(zoom()).toBe(1.25);
    expect(bar('example.com').getByRole('button', { name: 'Zoom 125%, reset' })).toBeEnabled();

    await user.click(bar('example.com').getByRole('button', { name: 'Zoom 125%, reset' }));
    expect(zoom()).toBe(1);
    expect(bar('example.com').getByRole('button', { name: 'Zoom 100%, reset' })).toBeDisabled();

    // The combos act on the tab that is active in the focused group (also when echoed
    // out of the page).
    act(() => void handleKeydown(new KeyboardEvent('keydown', { key: '-', ctrlKey: true })));
    expect(zoom()).toBe(0.9);
    act(() => void handleKeydown(new KeyboardEvent('keydown', { key: '=', ctrlKey: true })));
    expect(zoom()).toBe(1);

    await vi.waitFor(() => {
      expect(window.trifold.library.updateSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          workspace: expect.objectContaining({
            webTabs: [expect.objectContaining({ zoom: 1 })],
          }),
        }),
      );
    });
  });
});
