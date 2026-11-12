import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { SettingsPage } from './SettingsPage';

/** Rebuild index lives in Settings › Library (ADR 0026) and says what it did. */
describe('SettingsPage rebuild index', () => {
  beforeEach(() => {
    useAppStore.setState({
      library: {
        ok: true,
        path: '/library',
        error: null,
        settings: defaultLibrarySettings(),
        index: { ok: true, error: null },
      } as never,
      displays: [],
    });
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
});
