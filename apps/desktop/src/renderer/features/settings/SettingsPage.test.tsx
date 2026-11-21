import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useUpdateStore } from '../../stores/updateStore';
import { SettingsPage } from './SettingsPage';

/** Library › Settings (ADR 0054): sections in order, and the settings added with it. */
beforeEach(() => {
  useAppStore.setState({
    library: {
      ok: true,
      path: '/library',
      error: null,
      settings: defaultLibrarySettings(),
      index: { ok: true, error: null },
    } as never,
    displays: [
      {
        id: 7,
        number: 1,
        label: 'Display 1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        scaleFactor: 1,
        isPrimary: true,
        isInternal: true,
      },
      {
        id: 9,
        number: 2,
        label: 'Display 2 · LG TV',
        bounds: { x: 2560, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
        isPrimary: false,
        isInternal: false,
      },
    ],
  });
});

describe('SettingsPage', () => {
  it('lists the sections in priority order', async () => {
    await useUpdateStore.getState().load();
    render(<SettingsPage />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Table display',
      'Appearance',
      'Backups',
      'Updates',
      'Library',
      'Troubleshooting',
      'About',
    ]);
  });

  it('names screens by number, picks the TV and identifies them', async () => {
    render(<SettingsPage />);
    const group = screen.getByRole('radiogroup', { name: 'TV screen' });
    expect(group).toHaveTextContent('Display 2 · LG TV · 1920×1080');
    await userEvent.click(screen.getByRole('radio', { name: /Display 2 · LG TV/ }));
    expect(window.trifold.library.updateSettings).toHaveBeenCalledWith({ playerDisplayId: 9 });
    await userEvent.click(screen.getByRole('button', { name: 'Identify' }));
    expect(window.trifold.displays.identify).toHaveBeenCalledOnce();
  });

  it('changes the text size on this computer', async () => {
    render(<SettingsPage />);
    const select = screen.getByRole('combobox', { name: 'Text size' });
    await waitFor(() => expect(select).toBeEnabled());
    await userEvent.selectOptions(select, 'Extra large');
    expect(window.trifold.app.setTextSize).toHaveBeenCalledWith('larger');
  });

  it('shows recent Libraries only when there are others, and opens or forgets one', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(window.trifold.library.recent).toHaveBeenCalled());
    expect(screen.queryByRole('list', { name: 'Recent Libraries' })).toBeNull();
  });

  it('opens a recent Library and takes one off the list', async () => {
    vi.mocked(window.trifold.library.recent).mockResolvedValue([
      { path: 'D:\\Games\\Home', exists: true },
      { path: 'E:\\Gone', exists: false },
    ]);
    vi.mocked(window.trifold.library.forgetRecent).mockResolvedValue([
      { path: 'D:\\Games\\Home', exists: true },
    ]);
    render(<SettingsPage />);
    const list = await screen.findByRole('list', { name: 'Recent Libraries' });
    expect(list).toHaveTextContent('Folder not found');
    expect(screen.getByRole('button', { name: 'Open E:\\Gone' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Open D:\\Games\\Home' }));
    expect(window.trifold.library.open).toHaveBeenCalledWith('D:\\Games\\Home');
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove E:\\Gone from recent Libraries' }),
    );
    expect(window.trifold.library.forgetRecent).toHaveBeenCalledWith('E:\\Gone');
    await waitFor(() => expect(list).not.toHaveTextContent('E:\\Gone'));
  });

  it('rebuilds the index and reports the count', async () => {
    vi.mocked(window.trifold.sources.rebuildIndex).mockResolvedValue({
      records: 1234,
      sources: 3,
      version: 1,
      tookMs: 2500,
    });
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Rebuild index' }));
    expect(window.trifold.sources.rebuildIndex).toHaveBeenCalledOnce();
    expect(await screen.findByTestId('rebuild-status')).toHaveTextContent(
      'Rebuilt: 1234 records from 3 sources in 2.5 s.',
    );
  });

  it('opens the logs folder', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open logs folder' }));
    expect(window.trifold.app.openLogsFolder).toHaveBeenCalledOnce();
  });
});
