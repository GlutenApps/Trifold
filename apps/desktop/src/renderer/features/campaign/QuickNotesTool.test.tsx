import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Note } from '@trifold/schema';
import { installHotkeys, registerHotkey } from '../../hotkeys';
import { useCampaignStore } from '../../stores/campaignStore';
import { useQuickNotesStore } from '../../stores/quickNotesStore';
import { useShellStore } from '../../stores/shellStore';
import { defaultLayout } from '../../stores/shellLayout';
import { QuickNotesTool } from './QuickNotesTool';

const now = '2026-11-09T12:00:00.000Z';

function note(id: string, title: string, parentId: string | null, extra: Partial<Note> = {}): Note {
  return {
    schemaVersion: 1,
    id,
    kind: 'note',
    title,
    body: '',
    tags: [],
    links: [],
    parentId,
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const folder = note('qn', 'Quick Notes', null, { kind: 'folder', role: 'quickNotes' });

function bundle(notes: Note[]): CampaignBundle {
  return {
    campaign: { schemaVersion: 1, id: 'c1', slug: 'c', name: 'C', settings: {} },
    pcs: [],
    adventures: [],
    notes,
    npcs: [],
    encounters: [],
    scenes: [],
  } as unknown as CampaignBundle;
}

/** The Ctrl+N hotkey as AppShell registers it, plus the window listener. */
function withHotkeys() {
  const offs = [
    registerHotkey({
      id: 'quickNotes.open',
      combo: 'Ctrl+N',
      description: '',
      run: () => useQuickNotesStore.getState().summon(),
    }),
    installHotkeys(),
  ];
  return () => offs.forEach((off) => off());
}

describe('QuickNotesTool', () => {
  beforeEach(() => {
    useShellStore.setState({
      space: 'console',
      layout: defaultLayout(),
      flyout: null,
      viewportWidth: 1600,
    });
    useQuickNotesStore.setState({ pendingFocus: false });
  });

  it('needs a title to save, saves with the button, and puts focus back where the DM was', async () => {
    useCampaignStore.setState({ current: bundle([]) });
    const saved = note('n1', 'Guard took the bribe', 'qn', { capture: { at: now } });
    window.trifold.notes.capture = vi.fn(async () => ({ note: saved, folder }));
    const off = withHotkeys();
    render(
      <>
        <input aria-label="Elsewhere" />
        <div className="dock">
          <QuickNotesTool />
        </div>
      </>,
    );
    const elsewhere = screen.getByLabelText('Elsewhere');
    elsewhere.focus();
    await userEvent.keyboard('{Control>}n{/Control}');
    const title = screen.getByRole('textbox', { name: 'Quick note title' });
    expect(title).toHaveFocus();

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(title, '   ');
    expect(save).toBeDisabled();
    await userEvent.clear(title);
    // Enter in the title does not save: the Save button does.
    await userEvent.type(title, 'Guard took the bribe{Enter}');
    expect(window.trifold.notes.capture).not.toHaveBeenCalled();
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(window.trifold.notes.capture).toHaveBeenCalledWith({
      title: 'Guard took the bribe',
      body: '',
    });
    await waitFor(() => expect(elsewhere).toHaveFocus());
    expect(title).toHaveValue('');
    // The folder main made and the note are in the bundle, and the note is listed.
    expect(
      useCampaignStore
        .getState()
        .current!.notes.map((n) => n.id)
        .sort(),
    ).toEqual(['n1', 'qn']);
    expect(screen.getByTestId('quick-note-row')).toHaveTextContent('Guard took the bribe');
    off();
  });

  it('Escape drops the draft and returns focus without saving', async () => {
    useCampaignStore.setState({ current: bundle([]) });
    const off = withHotkeys();
    render(
      <>
        <input aria-label="Elsewhere" />
        <div className="dock">
          <QuickNotesTool />
        </div>
      </>,
    );
    const elsewhere = screen.getByLabelText('Elsewhere');
    elsewhere.focus();
    await userEvent.keyboard('{Control>}n{/Control}');
    await userEvent.keyboard('Half-written');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('textbox', { name: 'Quick note title' })).toHaveValue('');
    expect(elsewhere).toHaveFocus();
    expect(window.trifold.notes.capture).not.toHaveBeenCalled();
    off();
  });

  it('lists only notes inside the folder, newest first, and drops one moved out', async () => {
    const older = note('a', 'Older', 'qn', { capture: { at: '2026-11-09T10:00:00.000Z' } });
    const newer = note('b', 'Newer', 'qn', { capture: { at: '2026-11-09T11:00:00.000Z' } });
    const lore = note('lore', 'Lore', null, { kind: 'folder' });
    const outside = note('c', 'Elsewhere', null);
    useCampaignStore.setState({ current: bundle([folder, older, newer, lore, outside]) });
    window.trifold.notes.move = vi.fn(async () => [
      folder,
      newer,
      lore,
      outside,
      { ...older, parentId: 'lore' },
    ]);
    render(<QuickNotesTool />);
    expect(screen.getAllByTestId('quick-note-row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Newer'),
      expect.stringContaining('Older'),
    ]);

    // Find narrows by title.
    await userEvent.type(screen.getByLabelText('Find in quick notes'), 'old');
    expect(screen.getAllByTestId('quick-note-row')).toHaveLength(1);
    await userEvent.click(screen.getByTestId('quick-note-row'));

    // The open note has the notes panel's tools and a Move to menu.
    const pane = screen.getByTestId('note-pane');
    expect(within(pane).getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(within(pane).getByLabelText('Title')).toHaveValue('Older');
    await userEvent.selectOptions(within(pane).getByLabelText('Move to folder'), 'lore');
    expect(window.trifold.notes.move).toHaveBeenCalledWith('a', 'lore', 0);
    // Out of the folder, it is an ordinary note: the pane closes and the list no longer has it.
    await waitFor(() => expect(screen.queryByTestId('note-pane')).not.toBeInTheDocument());
    act(() => undefined);
    await userEvent.clear(screen.getByLabelText('Find in quick notes'));
    expect(screen.getAllByTestId('quick-note-row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Newer'),
    ]);
  });
});
