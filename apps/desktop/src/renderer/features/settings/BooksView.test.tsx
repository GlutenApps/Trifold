import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSummary, SourceSummary } from '@trifold/api';
import { bookMatches, bookTitle, BooksView, rulesOf } from './BooksView';

const book = (key: string, name: string, extra: Partial<BookSummary> = {}): BookSummary => ({
  key,
  name,
  unnamed: false,
  tags: [],
  records: 10,
  counts: { monster: 10 },
  editions: { '2024': 0, '2014': 10, unknown: 0 },
  files: [{ id: 'F1', name: 'Big file', records: 10 }],
  starred: false,
  off: false,
  ...extra,
});

const codex = book('example codex third party', 'Example Codex (Third Party)', {
  tags: ['Third Party'],
  starred: true,
});
const manual = book('example manual 2025', 'Example Manual (2025)', {
  editions: { '2024': 8, '2014': 2, unknown: 0 },
  files: [
    { id: 'F1', name: 'Big file', records: 6 },
    { id: 'F2', name: 'Manual file', records: 4 },
  ],
});
const unnamed = book('file:F1', 'Big file', { unnamed: true, off: true });

describe('book helpers', () => {
  it('says which rules a book uses, and shows its name without its tags', () => {
    expect(rulesOf(codex)).toBe('Legacy');
    expect(rulesOf(manual)).toBe('Mixed');
    expect(rulesOf(book('x', 'X', { editions: { '2024': 3, '2014': 0, unknown: 0 } }))).toBe(
      '2024',
    );
    expect(bookTitle(codex)).toBe('Example Codex');
    // A printing year is part of the title.
    expect(bookTitle(manual)).toBe('Example Manual (2025)');
  });

  it('filters by name, star, on or off, tag and file', () => {
    const base = { text: '', show: 'all' as const, tag: '', fileId: '' };
    expect(bookMatches(codex, { ...base, text: 'CODEX' })).toBe(true);
    expect(bookMatches(manual, { ...base, show: 'starred' })).toBe(false);
    expect(bookMatches(unnamed, { ...base, show: 'off' })).toBe(true);
    expect(bookMatches(unnamed, { ...base, show: 'on' })).toBe(false);
    expect(bookMatches(manual, { ...base, tag: 'Third Party' })).toBe(false);
    expect(bookMatches(manual, { ...base, fileId: 'F2' })).toBe(true);
    expect(bookMatches(codex, { ...base, fileId: 'F2' })).toBe(false);
  });
});

describe('BooksView', () => {
  const files = [
    { id: 'F1', name: 'Big file', stale: true, warnings: [] },
    { id: 'F2', name: 'Manual file', stale: false, warnings: ['x'] },
  ] as unknown as SourceSummary[];

  beforeEach(() => {
    vi.mocked(window.trifold.books.list).mockResolvedValue([codex, manual, unnamed]);
    vi.mocked(window.trifold.books.update).mockClear();
    vi.mocked(window.trifold.books.update).mockResolvedValue([codex, manual, unnamed]);
    vi.mocked(window.trifold.books.setRules).mockClear();
  });

  it('lists every book with what needs a look, and acts on a selection', async () => {
    const user = userEvent.setup();
    render(<BooksView files={files} onBrowse={() => undefined} />);
    const rows = await screen.findAllByTestId('book-row');
    expect(
      rows.map((r) => within(r).getAllByRole('checkbox')[0]!.getAttribute('aria-label')),
    ).toEqual([
      'Select Example Codex (Third Party)',
      'Select Example Manual (2025)',
      'Select Big file',
    ]);
    expect(rows[0]).toHaveTextContent('Third Party');
    expect(rows[1]).toHaveTextContent('2 files');
    expect(rows[2]).toHaveTextContent('records that name no book');
    expect(screen.getByTestId('books-attention')).toHaveTextContent(
      '1 file can be re-parsed (Files tab) · 1 file has import warnings (Files tab) · 1 book is in more than one file',
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select Example Manual (2025)' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Big file' }));
    expect(screen.getByRole('toolbar', { name: 'Selected books' })).toHaveTextContent('2 selected');
    vi.mocked(window.trifold.books.update).mockResolvedValue([
      codex,
      { ...manual, starred: true },
      unnamed,
    ]);
    await user.click(screen.getByRole('button', { name: 'Star' }));
    expect(window.trifold.books.update).toHaveBeenCalledWith(['example manual 2025', 'file:F1'], {
      starred: true,
    });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Rules for the selected books' }),
      '2024',
    );
    expect(window.trifold.books.setRules).toHaveBeenCalledWith(
      ['example manual 2025', 'file:F1'],
      true,
    );
  });

  it('stars and switches one book from its row, filters, and browses', async () => {
    const user = userEvent.setup();
    const onBrowse = vi.fn();
    render(<BooksView files={files} onBrowse={onBrowse} />);
    await screen.findAllByTestId('book-row');
    expect(
      screen.getByRole('button', { name: 'Star Example Codex (Third Party)' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Star Example Manual (2025)' }));
    expect(window.trifold.books.update).toHaveBeenLastCalledWith(['example manual 2025'], {
      starred: true,
    });
    await user.click(screen.getByRole('checkbox', { name: 'Big file on' }));
    expect(window.trifold.books.update).toHaveBeenLastCalledWith(['file:F1'], { off: false });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), 'Third Party');
    await waitFor(() => expect(screen.getAllByTestId('book-row')).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Browse Example Codex (Third Party)' }));
    expect(onBrowse).toHaveBeenCalledWith(codex);
  });
});

describe('Deleting books (ADR 0065)', () => {
  const files = [
    { id: 'F1', name: 'Big file', kind: 'xml', stale: false, warnings: [] },
    { id: 'F2', name: 'Manual file', kind: 'open5e', stale: false, warnings: [] },
  ] as unknown as SourceSummary[];
  const only2 = book('only open', 'Only Open', {
    files: [{ id: 'F2', name: 'Manual file', records: 3 }],
  });

  beforeEach(() => {
    vi.mocked(window.trifold.books.list).mockResolvedValue([codex, manual, only2]);
    vi.mocked(window.trifold.books.delete).mockClear();
    vi.mocked(window.trifold.books.delete).mockResolvedValue([manual, only2]);
  });

  it('asks for DELETE beside the row, then deletes only that book', async () => {
    const user = userEvent.setup();
    render(<BooksView files={files} onBrowse={() => undefined} />);
    await screen.findAllByTestId('book-row');
    // A book only in an opted-in document has no delete.
    expect(screen.queryByRole('button', { name: 'Delete Only Open' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Delete Example Codex (Third Party)' }));
    const confirm = screen.getByTestId('delete-books');
    expect(confirm).toHaveTextContent('10 records leave your Library, from Big file');
    const button = within(confirm).getByRole('button', { name: 'Delete book' });
    expect(button).toBeDisabled();
    await user.type(
      within(confirm).getByRole('textbox', {
        name: 'Type DELETE to delete Example Codex (Third Party)',
      }),
      'DELETE',
    );
    await user.click(button);
    await waitFor(() =>
      expect(window.trifold.books.delete).toHaveBeenCalledWith(['example codex third party']),
    );
    await waitFor(() => expect(screen.queryByTestId('delete-books')).toBeNull());
  });

  it('deletes a selection, counting only the copies in imported files, and Keep cancels', async () => {
    const user = userEvent.setup();
    render(<BooksView files={files} onBrowse={() => undefined} />);
    await screen.findAllByTestId('book-row');
    await user.click(screen.getByRole('checkbox', { name: 'Select every book shown' }));
    await user.click(screen.getByRole('button', { name: 'Delete…' }));
    const confirm = screen.getByTestId('delete-books');
    // The codex's 10 and the manual's 6 in Big file; the open document's copies stay.
    expect(confirm).toHaveTextContent('Delete 2 books: 16 records leave your Library');
    await user.click(within(confirm).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByTestId('delete-books')).toBeNull();
    expect(window.trifold.books.delete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete…' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Type DELETE to delete 2 books' }),
      'DELETE',
    );
    await user.click(screen.getByRole('button', { name: 'Delete books' }));
    await waitFor(() =>
      expect(window.trifold.books.delete).toHaveBeenCalledWith([
        'example codex third party',
        'example manual 2025',
      ]),
    );
  });
});
