import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Note } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useNoteTemplateStore } from '../../stores/noteTemplateStore';
import { CampaignNotes } from './CampaignNotes';

const now = '2026-09-28T00:00:00.000Z';
const TEMPLATE = {
  schemaVersion: 1 as const,
  id: 't1',
  name: 'Session prep',
  body: '## Strong start\n\nOpen in motion.',
  createdAt: now,
  updatedAt: now,
};

function note(
  id: string,
  title: string,
  order: number,
  parentId: string | null = null,
  kind: Note['kind'] = 'note',
  body = '',
): Note {
  return {
    schemaVersion: 1,
    id,
    kind,
    title,
    body,
    tags: [],
    links: [],
    parentId,
    order,
    createdAt: now,
    updatedAt: now,
  };
}

function seed(notes: Note[]) {
  useCampaignStore.setState({
    current: {
      campaign: { id: 'c1', name: 'Sunken Keep' },
      pcs: [],
      adventures: [],
      notes,
      npcs: [],
      encounters: [],
      scenes: [],
      counters: [],
      timers: [],
    } as unknown as CampaignBundle,
    error: null,
  });
}

function Harness() {
  const notes = useCampaignStore((s) => s.current?.notes ?? []);
  return <CampaignNotes notes={notes} />;
}

const titles = () => screen.getAllByRole('treeitem').map((row) => row.getAttribute('aria-label'));
const row = (name: string) => screen.getByRole('treeitem', { name });

/** jsdom has no layout: give a row a box so the drop position can be read from the pointer. */
function box(el: HTMLElement, top = 0, height = 20) {
  el.getBoundingClientRect = () =>
    ({
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: top,
    }) as DOMRect;
}

const dataTransfer = () => ({
  setData: vi.fn(),
  getData: vi.fn(() => ''),
  effectAllowed: 'none',
  dropEffect: 'none',
});

/** A drag event with a pointer height; jsdom's generic Event drops `clientY` from the init. */
function dragEvent(type: 'dragOver' | 'drop', el: HTMLElement, dt: object, clientY: number) {
  const event = createEvent[type](el, { dataTransfer: dt });
  Object.defineProperty(event, 'clientY', { value: clientY });
  return event;
}

/** Drags `from` and drops it on `to` at `clientY` within `to`'s 20 px box. */
function drag(from: HTMLElement, to: HTMLElement, clientY: number) {
  const dt = dataTransfer();
  box(to);
  fireEvent.dragStart(from, { dataTransfer: dt });
  fireEvent(to, dragEvent('dragOver', to, dt, clientY));
  fireEvent(to, dragEvent('drop', to, dt, clientY));
}

describe('CampaignNotes', () => {
  beforeEach(() => {
    seed([
      note('act1', 'Act one', 0, null, 'folder'),
      note('gate', 'Gate', 0, 'act1', 'note', 'The gates are shut. Knock and the gates open.'),
      note('hall', 'Hall', 1, 'act1'),
      note('later', 'Later', 1, null, 'folder'),
      note('rumours', 'Rumours', 2, null, 'note', 'A worg den under the **gates** of the mill.'),
    ]);
    vi.mocked(window.trifold.notes.save).mockImplementation(async (n) => ({
      ...n,
      id: n.id || 'fresh',
    }));
    vi.mocked(window.trifold.notes.move).mockImplementation(
      async () => useCampaignStore.getState().current!.notes,
    );
    useNoteTemplateStore.setState({ templates: [], loaded: false, error: null });
    vi.mocked(window.trifold.noteTemplates.list).mockResolvedValue([TEMPLATE]);
    vi.mocked(window.trifold.noteTemplates.save).mockImplementation(async (t) => ({
      ...t,
      id: t.id || 'tfresh',
    }));
  });

  it('shows folders open in tree order, and collapses one', async () => {
    render(<Harness />);
    expect(titles()).toEqual(['Act one', 'Gate', 'Hall', 'Later', 'Rumours']);
    expect(row('Act one')).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Act one' }));
    expect(titles()).toEqual(['Act one', 'Later', 'Rumours']);
    expect(row('Act one')).toHaveAttribute('aria-expanded', 'false');
  });

  it('adds a note inside the selected folder and opens it', async () => {
    render(<Harness />);
    await userEvent.click(row('Act one'));
    await userEvent.click(screen.getByRole('button', { name: 'New note' }));

    expect(window.trifold.notes.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: '', kind: 'note', parentId: 'act1', order: 2 }),
    );
    expect(titles()).toEqual(['Act one', 'Gate', 'Hall', 'Untitled note', 'Later', 'Rumours']);
    expect(within(screen.getByTestId('note-pane')).getByLabelText('Title')).toHaveValue(
      'Untitled note',
    );
  });

  it('adds a folder at the root when nothing is selected', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'New notes folder' }));
    expect(window.trifold.notes.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', parentId: null, order: 3, title: 'New folder' }),
    );
    expect(screen.getByTestId('folder-pane')).toBeInTheDocument();
  });

  it('saves the open note by itself shortly after typing', async () => {
    render(<Harness />);
    await userEvent.click(row('Gate'));
    const pane = screen.getByTestId('note-pane');
    expect(within(pane).getByLabelText('Body')).toHaveTextContent('The gates are shut.');

    await userEvent.type(within(pane).getByLabelText('Title'), ' of bone');
    await userEvent.type(within(pane).getByLabelText('Tags (comma-separated)'), 'keep');
    expect(within(pane).getByText('Unsaved')).toBeInTheDocument();

    await waitFor(
      () =>
        expect(window.trifold.notes.save).toHaveBeenLastCalledWith(
          expect.objectContaining({ id: 'gate', title: 'Gate of bone', tags: ['keep'] }),
        ),
      { timeout: 2000 },
    );
    expect(within(pane).getByText('Saved')).toBeInTheDocument();
    expect(titles()).toContain('Gate of bone');
  });

  it('drags a note above a sibling and saves the move', () => {
    render(<Harness />);
    // The top quarter of Gate's box: before it.
    drag(row('Hall'), row('Gate'), 2);

    expect(window.trifold.notes.move).toHaveBeenCalledWith('hall', 'act1', 0);
    expect(titles()).toEqual(['Act one', 'Hall', 'Gate', 'Later', 'Rumours']);
  });

  it('drags a note onto a folder’s middle to put it inside, opening the folder', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Later' }));
    drag(row('Rumours'), row('Later'), 10);

    expect(window.trifold.notes.move).toHaveBeenCalledWith('rumours', 'later', 0);
    expect(titles()).toEqual(['Act one', 'Gate', 'Hall', 'Later', 'Rumours']);
    expect(row('Rumours')).toHaveStyle({ paddingLeft: '22px' });
  });

  it('drags a note onto the empty space to put it last at the root', () => {
    render(<Harness />);
    const tree = screen.getByRole('tree', { name: 'Notes' });
    const dt = dataTransfer();
    fireEvent.dragStart(row('Gate'), { dataTransfer: dt });
    fireEvent.dragOver(tree, { dataTransfer: dt });
    fireEvent.drop(tree, { dataTransfer: dt });

    expect(window.trifold.notes.move).toHaveBeenCalledWith('gate', null, 3);
    expect(titles()).toEqual(['Act one', 'Hall', 'Later', 'Rumours', 'Gate']);
  });

  it('refuses to drop a folder into itself', () => {
    render(<Harness />);
    drag(row('Act one'), row('Gate'), 2);
    expect(window.trifold.notes.move).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Act one', 'Gate', 'Hall', 'Later', 'Rumours']);
  });

  it('puts the tree back when saving a move fails', async () => {
    vi.mocked(window.trifold.notes.move).mockRejectedValue(new Error('disk full'));
    render(<Harness />);
    drag(row('Hall'), row('Gate'), 2);

    await waitFor(() => expect(useCampaignStore.getState().error).toBe('disk full'));
    expect(titles()).toEqual(['Act one', 'Gate', 'Hall', 'Later', 'Rumours']);
  });

  it('removes a folder keeping its contents, and asks before deleting them', async () => {
    render(<Harness />);
    await userEvent.click(row('Act one'));
    const pane = screen.getByTestId('folder-pane');
    expect(within(pane).getByText(/^2 notes\./)).toBeInTheDocument();

    await userEvent.click(
      within(pane).getByRole('button', { name: 'Remove folder and contents…' }),
    );
    expect(
      within(pane).getByRole('button', { name: 'Delete 2 notes for good' }),
    ).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Keep them' }));
    expect(window.trifold.notes.remove).not.toHaveBeenCalled();

    await userEvent.click(
      within(pane).getByRole('button', { name: 'Remove folder, keep contents' }),
    );
    expect(window.trifold.notes.remove).toHaveBeenCalledWith('act1', 'lift');
    expect(titles()).toEqual(['Later', 'Rumours', 'Gate', 'Hall']);
  });

  it('finds a phrase, shows where it is, and opens the note at that hit', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Find in notes'), 'gates');

    const results = screen.getAllByTestId('note-result');
    expect(
      results.map((r) => within(r).getByRole('button', { name: /^Open \w+$/ }).textContent),
    ).toEqual(['Gate2', 'Rumours1']);
    const gate = results[0]!;
    expect(within(gate).getByText('Act one')).toBeInTheDocument();
    const snippets = within(gate).getAllByRole('button', { name: /at match/ });
    expect(snippets.map((s) => s.textContent)).toEqual([
      'The gates are shut. Knock and the gates open.',
      'The gates are shut. Knock and the gates open.',
    ]);
    expect(snippets[1]!.querySelector('mark')).toHaveTextContent('gates');
    expect(screen.getByText('– of 3')).toBeInTheDocument();

    await userEvent.click(snippets[1]!);
    expect(within(screen.getByTestId('note-pane')).getByLabelText('Title')).toHaveValue('Gate');
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    const hits = document.querySelectorAll('.search-hit');
    expect(hits).toHaveLength(2);
    expect(hits[1]).toHaveClass('active');

    // Enter steps on to the next hit, across notes, and wraps.
    await userEvent.type(screen.getByLabelText('Find in notes'), '{Enter}');
    expect(within(screen.getByTestId('note-pane')).getByLabelText('Title')).toHaveValue('Rumours');
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Find in notes'), '{Enter}');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('goes back to the list from the open note', async () => {
    render(<Harness />);
    await userEvent.click(row('Gate'));
    await userEvent.click(screen.getByRole('button', { name: 'Back to notes' }));
    expect(screen.queryByTestId('note-pane')).not.toBeInTheDocument();
    expect(row('Gate')).toHaveAttribute('aria-selected', 'false');
  });

  it('starts a note from a template', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Session prep' }));

    expect(window.trifold.notes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Session prep',
        body: '## Strong start\n\nOpen in motion.',
        parentId: null,
      }),
    );
    const pane = screen.getByTestId('note-pane');
    expect(within(pane).getByLabelText('Title')).toHaveValue('Session prep');
    expect(within(pane).getByRole('heading', { level: 2 })).toHaveTextContent('Strong start');
  });

  it('keeps the open note as a template and opens it for a rename', async () => {
    render(<Harness />);
    await userEvent.click(row('Gate'));
    await userEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save open note as template' }));

    expect(window.trifold.noteTemplates.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '',
        name: 'Gate',
        body: 'The gates are shut. Knock and the gates open.',
      }),
    );
    const pane = await screen.findByTestId('templates-pane');
    expect(within(pane).getByLabelText('Template name')).toHaveValue('Gate');
    expect(
      within(pane)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Session prep', 'Gate']);
    await userEvent.click(within(pane).getByRole('button', { name: 'Back to notes' }));
    expect(screen.queryByTestId('templates-pane')).not.toBeInTheDocument();
  });

  it('manages templates: adds one, and deletes one after a second click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Manage templates…' }));
    const pane = screen.getByTestId('templates-pane');
    expect(within(pane).getByLabelText('Template name')).toHaveValue('Session prep');

    await userEvent.click(within(pane).getByRole('button', { name: 'New template' }));
    expect(window.trifold.noteTemplates.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: '', name: 'New template' }),
    );
    expect(within(pane).getByLabelText('Template name')).toHaveValue('New template');

    await userEvent.click(
      within(pane).getByRole('button', { name: 'Delete template New template' }),
    );
    const confirm = within(pane).getByRole('group', { name: 'Delete New template?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(window.trifold.noteTemplates.remove).toHaveBeenCalledWith('tfresh');
    expect(
      within(pane)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Session prep']);
  });
});
