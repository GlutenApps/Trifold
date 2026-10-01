import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Note } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { CampaignNotes } from './CampaignNotes';

const now = '2026-09-28T00:00:00.000Z';

function note(id: string, title: string, order: number, body = ''): Note {
  return {
    schemaVersion: 1,
    id,
    title,
    body,
    tags: [],
    links: [],
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
    } as unknown as CampaignBundle,
    error: null,
  });
}

function Harness() {
  const notes = useCampaignStore((s) => s.current?.notes ?? []);
  return <CampaignNotes notes={notes} />;
}

const titles = () =>
  screen.getAllByTestId('note-row').map((row) => row.querySelector('strong')?.textContent);

describe('CampaignNotes', () => {
  beforeEach(() =>
    seed([note('n1', 'Arrival', 0, 'The gates are shut.'), note('n2', 'Market', 1)]),
  );

  it('adds a note at the end of the list', async () => {
    vi.mocked(window.trifold.notes.save).mockImplementation(async (n) => ({
      ...n,
      id: 'n3',
      order: 2,
    }));
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'New note' }));
    const form = screen.getByRole('form', { name: 'New note' });
    await userEvent.type(within(form).getByLabelText('Title'), 'Night falls');
    await userEvent.type(within(form).getByLabelText('Body (markdown)'), '**Wolves** howl.');
    await userEvent.type(within(form).getByLabelText('Tags (comma-separated)'), 'act 1, wolves');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));

    expect(window.trifold.notes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '',
        title: 'Night falls',
        body: '**Wolves** howl.',
        tags: ['act 1', 'wolves'],
      }),
    );
    expect(titles()).toEqual(['Arrival', 'Market', 'Night falls']);
    // A saved note opens so the DM sees what they wrote.
    expect(screen.getByText('**Wolves** howl.')).toBeInTheDocument();
  });

  it('edits a note in place', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Arrival' }));
    const form = screen.getByRole('form', { name: 'Edit Arrival' });
    const body = within(form).getByLabelText('Body (markdown)');
    expect(body).toHaveValue('The gates are shut.');
    await userEvent.clear(within(form).getByLabelText('Title'));
    await userEvent.type(within(form).getByLabelText('Title'), 'Arrival at dusk');
    await userEvent.type(body, '{Control>}{Enter}{/Control}');

    expect(window.trifold.notes.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', title: 'Arrival at dusk', order: 0 }),
    );
    expect(titles()).toEqual(['Arrival at dusk', 'Market']);
  });

  it('won’t save a note without a title, and Escape cancels', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'New note' }));
    const form = screen.getByRole('form', { name: 'New note' });
    expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(within(form).getByLabelText('Title'), '{Escape}');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(window.trifold.notes.save).not.toHaveBeenCalled();
  });

  it('moves a note down and saves the new order', async () => {
    vi.mocked(window.trifold.notes.reorder).mockImplementation(async () => [
      note('n2', 'Market', 0),
      note('n1', 'Arrival', 1, 'The gates are shut.'),
    ]);
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Move Arrival up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Arrival down' }));

    expect(window.trifold.notes.reorder).toHaveBeenCalledWith(['n2', 'n1']);
    expect(titles()).toEqual(['Market', 'Arrival']);
  });

  it('puts the list back when saving the order fails', async () => {
    vi.mocked(window.trifold.notes.reorder).mockRejectedValue(new Error('disk full'));
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Market up' }));

    expect(titles()).toEqual(['Arrival', 'Market']);
    expect(useCampaignStore.getState().error).toBe('disk full');
  });
});
