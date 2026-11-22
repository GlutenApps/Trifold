import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuplicateGroup } from '@trifold/api';
import {
  defaultLibrarySettings,
  type CompendiumRecord,
  type LibrarySettings,
} from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { UseThisCopy } from '../compendium/UseThisCopy';
import { copyLabel, DuplicatesView } from './DuplicatesView';

let settings: LibrarySettings;
function library(duplicateChoices: Record<string, string> = {}) {
  settings = { ...defaultLibrarySettings(), duplicateChoices };
  useAppStore.setState({ library: { ok: true, settings, index: { ok: true } } as never });
  vi.mocked(window.trifold.library.updateSettings).mockImplementation(async (patch) => {
    settings = { ...settings, ...patch };
    return settings;
  });
}

const ward: DuplicateGroup = {
  group: 'spell|ward',
  kind: 'spell',
  name: 'Ward',
  reason: 'starred',
  chosen: null,
  copies: [
    {
      recordId: 'A:ward',
      copy: 'A|tome|2014',
      sourceName: 'Big file',
      book: 'Tome',
      edition: '2014',
      homebrew: false,
      starred: true,
    },
    {
      recordId: 'srd:ward',
      copy: 'srd-2024||2024',
      sourceName: 'SRD 5.2',
      book: '',
      edition: '2024',
      homebrew: false,
      starred: false,
    },
  ],
};

beforeEach(() => {
  library();
  vi.mocked(window.trifold.duplicates.list).mockResolvedValue({ total: 1, groups: [ward] });
});

describe('DuplicatesView (ADR 0063)', () => {
  it('lists each record with the copy shown and why, and settles one', async () => {
    const user = userEvent.setup();
    render(<DuplicatesView />);
    const row = await screen.findByTestId('duplicate-row');
    expect(row).toHaveTextContent('Shown: Tome (Big file) · legacy · starred, from a starred book');
    expect(within(row).getByRole('radio', { name: 'Automatic' })).toBeChecked();
    // Main answers with the record settled once the choice is saved.
    vi.mocked(window.trifold.duplicates.list).mockResolvedValue({
      total: 1,
      groups: [{ ...ward, chosen: 'srd-2024||2024', reason: 'chosen' }],
    });
    await user.click(within(row).getByRole('radio', { name: 'SRD 5.2 · 2024' }));
    await waitFor(() =>
      expect(settings.duplicateChoices).toEqual({ 'spell|ward': 'srd-2024||2024' }),
    );
    await user.click(within(row).getByRole('radio', { name: 'Automatic' }));
    await waitFor(() => expect(settings.duplicateChoices).toEqual({}));
  });

  it('filters by name, kind and whether a record is settled', async () => {
    const user = userEvent.setup();
    render(<DuplicatesView />);
    await screen.findByTestId('duplicate-row');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'monster');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Settled' }), 'settled');
    await waitFor(() =>
      expect(window.trifold.duplicates.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'monster', show: 'settled' }),
      ),
    );
    expect(copyLabel({ ...ward.copies[0]!, homebrew: true })).toBe(
      'Homebrew (Big file) · legacy · starred',
    );
  });
});

describe('UseThisCopy', () => {
  const record = (id: string, sourceId: string, sourceBook?: string, edition = '2024') =>
    ({
      id,
      kind: 'spell',
      key: 'ward',
      displayName: 'Ward',
      sourceId,
      edition,
      ...(sourceBook ? { sourceBook } : {}),
    }) as CompendiumRecord;

  it('appears only when the record is in another file or book, and pins this copy', async () => {
    const user = userEvent.setup();
    const here = record('A:ward', 'A', 'Tome', '2014');
    // Only another edition in the same place: nothing to settle.
    const { rerender } = render(
      <UseThisCopy record={here} copies={[here, record('A:ward2', 'A', 'Tome')]} />,
    );
    expect(screen.queryByRole('button', { name: 'Always use this copy' })).toBeNull();

    rerender(<UseThisCopy record={here} copies={[here, record('srd:ward', 'srd-2024')]} />);
    const pin = screen.getByRole('button', { name: 'Always use this copy' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await user.click(pin);
    await waitFor(() => expect(settings.duplicateChoices).toEqual({ 'spell|ward': 'A|tome|2014' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Always use this copy' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Always use this copy' }));
    await waitFor(() => expect(settings.duplicateChoices).toEqual({}));
  });
});
