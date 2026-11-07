import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupCopyStatus, BackupFileInfo } from '@trifold/api';
import { defaultLibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { BackupsCard } from './BackupsCard';

const OFF: BackupCopyStatus = { folder: null, target: null, lastCopyAt: null, lastError: null };

const PICKED: BackupFileInfo = {
  path: 'E:\\Sync\\Trifold backups\\Trifold Library\\2026-11-06-quit.zip',
  name: '2026-11-06-quit.zip',
  sizeBytes: 2048,
  manifest: {
    kind: 'library',
    appVersion: '0.1.0',
    librarySchemaVersion: 1,
    campaignSchemaVersion: 1,
    createdAt: '2026-11-06T22:00:00.000Z',
    counts: { campaigns: 3, homebrew: 41, sources: 1 },
  },
  problem: null,
};

describe('BackupsCard', () => {
  beforeEach(() => {
    useAppStore.setState({
      library: {
        path: 'C:\\test\\Library',
        ok: true,
        error: null,
        settings: defaultLibrarySettings(),
        index: { ok: true, version: 1, error: null },
      },
    });
  });

  it('offers a second location and shows where zips will land once chosen', async () => {
    const chosen: BackupCopyStatus = {
      folder: 'E:\\Sync',
      target: 'E:\\Sync\\Trifold backups\\Library',
      lastCopyAt: null,
      lastError: null,
    };
    vi.mocked(window.trifold.backups.chooseCopyFolder).mockResolvedValue(chosen);
    render(<BackupsCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Choose folder…' }));
    expect(await screen.findByTestId('backup-copy-target')).toHaveTextContent(chosen.target!);
    expect(screen.getByTestId('backup-copy-status')).toHaveTextContent('Nothing copied yet');

    vi.mocked(window.trifold.backups.stopCopying).mockResolvedValue(OFF);
    await userEvent.click(screen.getByRole('button', { name: 'Stop copying' }));
    expect(await screen.findByRole('button', { name: 'Choose folder…' })).toBeInTheDocument();
  });

  it('shows a failed copy until the next one succeeds', async () => {
    vi.mocked(window.trifold.backups.copyStatus).mockResolvedValue({
      folder: 'E:\\',
      target: 'E:\\Trifold backups\\Library',
      lastCopyAt: '2026-11-01T10:00:00.000Z',
      lastError: "E:\\ can't be reached",
    });
    render(<BackupsCard />);
    expect(await screen.findByTestId('backup-copy-status')).toHaveTextContent(
      "The last copy failed: E:\\ can't be reached",
    );
  });

  it('restores a picked file after an inline confirm that says what it holds', async () => {
    vi.mocked(window.trifold.backups.chooseFile).mockResolvedValue(PICKED);
    render(<BackupsCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Restore from file…' }));
    const picked = await screen.findByTestId('backup-file-picked');
    expect(picked).toHaveTextContent('3 campaigns, 41 homebrew records, 1 imported source');
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(window.trifold.backups.restoreFile).toHaveBeenCalledWith(PICKED.path),
    );
  });

  it('explains a file it will not restore instead of offering to', async () => {
    vi.mocked(window.trifold.backups.chooseFile).mockResolvedValue({
      ...PICKED,
      problem: 'Made by a newer Trifold (2.0.0); update Trifold to restore it',
    });
    render(<BackupsCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Restore from file…' }));
    expect(await screen.findByTestId('backup-file-picked')).toHaveTextContent('newer Trifold');
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(window.trifold.backups.restoreFile).not.toHaveBeenCalled();
  });
});
