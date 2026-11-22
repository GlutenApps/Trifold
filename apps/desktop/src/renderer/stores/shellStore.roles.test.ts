import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LibrarySettings,
  PlayerShellLayout,
  PLAYER_MINOR_KINDS,
  ShellLayout,
} from '@trifold/schema';
import { useAppStore } from './appStore';
import { discardPendingSaves, flushPendingSaves } from './pendingSaves';
import { defaultLayout, defaultPlayerLayout, STARTER_PRESETS } from './shellLayout';
import { useShellStore } from './shellStore';

/**
 * The shell's two roles (docs/PLAYER-MODE.md): one shell store loads the GM's console or a
 * joined campaign's player console, and keeps each one's layout in its own place.
 */
const shell = () => useShellStore.getState();

beforeEach(() => {
  discardPendingSaves();
  useShellStore.setState({
    space: 'library',
    role: 'gm',
    campaignSlug: null,
    joinedId: null,
    layout: defaultLayout(),
    presets: STARTER_PRESETS.map((p) => ({ name: p.name, layout: p.layout })),
    consoles: {},
    playerConsoles: {},
    webTabs: [],
    flyout: null,
    pop: null,
    viewportWidth: 1920,
    dockExpanded: false,
    hydratedFor: 'C:\\lib',
  });
});

describe('the player console in the shell', () => {
  it('opens a joined campaign on the player layout, with the player tabs and tools only', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    expect(shell()).toMatchObject({
      space: 'console',
      role: 'player',
      joinedId: '01CAMPAIGN',
      campaignSlug: null,
    });
    expect(shell().layout).toEqual(defaultPlayerLayout());
    expect(shell().layout.stage.groups[0]?.tabs).toEqual(['table', 'character', 'compendium']);
  });

  it('keeps the dock to the player tools, in their order, through every change', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().toggleSection('quickNotes');
    shell().closeTab('character');
    shell().moveTab('compendium', 1);
    expect(shell().layout.dock.sections.map((s) => s.tool)).toEqual([...PLAYER_MINOR_KINDS]);
    expect(shell().layout.dock.sections.find((s) => s.tool === 'quickNotes')?.open).toBe(true);
    expect(shell().layout.stage.groups.map((g) => g.tabs)).toEqual([['table'], ['compendium']]);
  });

  it('saves the player layout by joined campaign, without a tray, and leaves the GM consoles', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().closeTab('character');
    shell().enterLibrary();
    const saved = shell().playerConsoles['01CAMPAIGN'];
    expect(saved?.stage.groups[0]?.tabs).toEqual(['table', 'compendium']);
    expect(saved).not.toHaveProperty('tray');
    // What is saved is a layout the schema takes as a player's, and refuses as a GM's.
    expect(PlayerShellLayout.safeParse(saved).success).toBe(true);
    expect(ShellLayout.safeParse({ ...saved, tray: [] }).success).toBe(false);
    expect(shell().consoles).toEqual({});
  });

  it('comes back to the same joined campaign as it was left', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().closeTab('compendium');
    shell().enterLibrary();
    shell().enterPlayerConsole('01CAMPAIGN');
    expect(shell().layout.stage.groups[0]?.tabs).toEqual(['table', 'character']);
    shell().leaveCampaign();
    shell().enterPlayerConsole('01CAMPAIGN');
    expect(shell().layout.stage.groups[0]?.tabs).toEqual(['table', 'character']);
    // Another joined campaign starts fresh.
    shell().enterPlayerConsole('01OTHER');
    expect(shell().layout).toEqual(defaultPlayerLayout());
    expect(Object.keys(shell().playerConsoles).sort()).toEqual(['01CAMPAIGN']);
  });

  it('gives the shell back to the GM role on leaving, with a GM layout', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().leaveCampaign();
    expect(shell()).toMatchObject({ space: 'library', role: 'gm', joinedId: null });
    expect(shell().layout).toEqual(defaultLayout());
  });

  it('never mixes the two: a GM console opened after a player one gets GM tabs and tools', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().closeTab('character');
    shell().enterConsole('greyford');
    expect(shell()).toMatchObject({ role: 'gm', campaignSlug: 'greyford', joinedId: null });
    expect(shell().layout).toEqual(defaultLayout());
    expect(shell().playerConsoles['01CAMPAIGN']?.stage.groups[0]?.tabs).toEqual([
      'table',
      'compendium',
    ]);
    shell().toggleSection('music');
    shell().enterLibrary();
    expect(ShellLayout.safeParse(shell().consoles['greyford']).success).toBe(true);
  });

  it('keeps named layouts for the GM: a player console cannot apply, save or match one', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    const before = shell().layout;
    shell().applyLayout(0);
    expect(shell().layout).toBe(before);
    shell().savePreset('Mine');
    shell().updatePreset(0);
    expect(shell().presets.map((p) => p.name)).toEqual(STARTER_PRESETS.map((p) => p.name));
    expect(shell().presets[0]?.layout).toEqual(STARTER_PRESETS[0]?.layout);
    expect(shell().currentPresetIndex()).toBe(-1);
  });

  it('drops a removed web tab from saved player consoles too', () => {
    const key = shell().addWebTab({ url: 'https://example.com/sheet', title: 'Sheet' });
    const id = shell().webTabs[0]!.id;
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().openMajor(key);
    shell().enterLibrary();
    expect(shell().playerConsoles['01CAMPAIGN']?.stage.groups[0]?.tabs).toContain(key);
    shell().removeWebTab(id);
    expect(shell().playerConsoles['01CAMPAIGN']?.stage.groups[0]?.tabs).not.toContain(key);
  });

  it('forgets a left campaign’s console, closing it when it is the one loaded', () => {
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().enterLibrary();
    shell().forgetPlayerConsole('01CAMPAIGN');
    expect(shell().playerConsoles).toEqual({});
    expect(shell()).toMatchObject({ role: 'gm', joinedId: null, space: 'library' });
  });

  it('writes both kinds of console to the Library in one workspace the schema accepts', async () => {
    const updateSettings = vi.fn(async () => undefined);
    useAppStore.setState({ updateSettings });
    shell().enterConsole('greyford');
    shell().toggleSection('music');
    shell().enterLibrary();
    shell().enterPlayerConsole('01CAMPAIGN');
    shell().toggleSection('quickNotes');
    await flushPendingSaves();
    const workspace = (updateSettings.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
      workspace: unknown;
    };
    const parsed = LibrarySettings.parse({ schemaVersion: 5, workspace: workspace.workspace });
    expect(Object.keys(parsed.workspace.consoles)).toEqual(['greyford']);
    expect(Object.keys(parsed.workspace.playerConsoles)).toEqual(['01CAMPAIGN']);
    expect(parsed.workspace.playerConsoles['01CAMPAIGN']?.dock.sections.every((s) => s.open)).toBe(
      true,
    );
  });
});
