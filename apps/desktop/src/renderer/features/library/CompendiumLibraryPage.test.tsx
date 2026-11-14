import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumRow } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { blankRecord } from '../compendium/homebrew';
import { CompendiumLibraryPage } from './CompendiumLibraryPage';

/** Library › Compendium (ADR 0025): one button swaps the browser for Sources and back. */
describe('CompendiumLibraryPage', () => {
  beforeEach(() => {
    useAppStore.setState({ library: { ok: true } as never });
    useCompendiumStore.setState({ kind: 'monster', editing: null, editingOwn: false });
  });

  it('opens on the browser, shows Sources with the import beside the button, and goes back', async () => {
    const user = userEvent.setup();
    render(<CompendiumLibraryPage />);
    expect(screen.getByRole('heading', { name: 'Compendium' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Compendium section' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import Game Master XML…' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Sources' }));
    expect(screen.getByRole('heading', { name: 'Compendium sources' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Import Game Master XML…' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Rebuild index' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to the compendium' }));
    expect(screen.getByRole('heading', { name: 'Compendium' })).toBeInTheDocument();
  });

  it('New homebrew starts a blank record of the chosen kind in the editor', async () => {
    const user = userEvent.setup();
    render(<CompendiumLibraryPage />);
    await user.click(screen.getByRole('button', { name: 'New homebrew' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Homebrew kind' }), 'spell');
    await user.click(screen.getByRole('button', { name: 'Start a blank spell' }));
    expect(screen.queryByTestId('new-homebrew')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'New spell' })).toBeInTheDocument();
    expect(useCompendiumStore.getState()).toMatchObject({
      kind: 'spell',
      editingOwn: false,
      editingFrom: null,
    });
    // Nothing is written until Save.
    expect(window.trifold.homebrew.save).not.toHaveBeenCalled();
  });

  it('New homebrew opens an unsaved copy of an existing record found by name', async () => {
    const user = userEvent.setup();
    const row = {
      id: 'srd:item:1',
      kind: 'item',
      displayName: 'Bag of Holding',
      sourceName: 'SRD',
      edition: '2024',
    } as CompendiumRow;
    vi.mocked(window.trifold.compendium.search).mockImplementation(async (q) =>
      q.kind === 'item' && q.text === 'bag'
        ? { rows: [row], total: 1, tookMs: 0 }
        : { rows: [], total: 0, tookMs: 0 },
    );
    const copy = { ...blankRecord('item'), name: 'Copy of Bag', displayName: 'Copy of Bag' };
    vi.mocked(window.trifold.homebrew.draft).mockResolvedValue(copy);
    vi.mocked(window.trifold.compendium.get).mockResolvedValue({
      ...blankRecord('item'),
      id: 'srd:item:1',
      displayName: 'Bag of Holding',
    });
    render(<CompendiumLibraryPage />);
    await user.click(screen.getByRole('button', { name: 'New homebrew' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Homebrew kind' }), 'item');
    await user.type(screen.getByRole('searchbox', { name: 'Find a item to copy' }), 'bag');
    await user.click(await screen.findByRole('button', { name: /Bag of Holding/ }));
    expect(window.trifold.homebrew.draft).toHaveBeenCalledWith('srd:item:1');
    expect(await screen.findByRole('heading', { name: 'Edit Bag of Holding' })).toBeInTheDocument();
    // A copy is written only at Confirm.
    expect(window.trifold.homebrew.save).not.toHaveBeenCalled();
  });
});
