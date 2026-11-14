import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '@trifold/api';
import { useShellStore } from '../../stores/shellStore';
import { useUpdateStore } from '../../stores/updateStore';
import { UpdatePrompt, UpdatesCard, UpdateTopBarButton } from './Updates';

const base: UpdateStatus = {
  current: '0.3.0',
  enabled: false,
  asked: false,
  checking: false,
  lastCheckAt: null,
  available: null,
  dismissed: false,
  lastError: null,
};
const found = {
  version: '0.4.0',
  name: 'Trifold v0.4.0',
  url: 'https://example.test/releases/tag/v0.4.0',
  publishedAt: null,
};

const showing = (status: Partial<UpdateStatus>) =>
  useUpdateStore.setState({ status: { ...base, ...status }, error: null });

describe('UpdatePrompt', () => {
  beforeEach(() => showing({}));

  it('asks once, and Turn on switches the daily check on', async () => {
    vi.mocked(window.trifold.updates.setEnabled).mockResolvedValue({
      ...base,
      enabled: true,
      asked: true,
    });
    render(<UpdatePrompt />);
    expect(screen.getByRole('region', { name: 'Check for updates' })).toHaveTextContent(
      'It sends only its own version number, never your games',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(window.trifold.updates.setEnabled).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('region', { name: 'Check for updates' })).toBeNull();
  });

  it('No thanks answers too, and the question does not come back', async () => {
    vi.mocked(window.trifold.updates.setEnabled).mockResolvedValue({ ...base, asked: true });
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(window.trifold.updates.setEnabled).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('region', { name: 'Check for updates' })).toBeNull();
  });
});

describe('UpdatesCard', () => {
  it('offers Check now with the daily check off, and says what it found', async () => {
    showing({ asked: true });
    vi.mocked(window.trifold.updates.checkNow).mockResolvedValue({
      ...base,
      asked: true,
      lastCheckAt: '2026-11-20T12:00:00Z',
      available: found,
    });
    render(<UpdatesCard />);
    expect(
      screen.getByRole('checkbox', { name: 'Check for new versions once a day' }),
    ).not.toBeChecked();
    expect(screen.getByTestId('update-status')).toHaveTextContent(
      'You have Trifold 0.3.0. Not checked yet.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Check now' }));
    expect(screen.getByTestId('update-status')).toHaveTextContent('Trifold 0.4.0 is out.');
    await userEvent.click(screen.getByRole('button', { name: 'Download 0.4.0' }));
    expect(window.trifold.updates.openDownload).toHaveBeenCalled();
  });

  it('turns the daily check on and off at any time', async () => {
    showing({ asked: true });
    render(<UpdatesCard />);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Check for new versions once a day' }),
    );
    expect(window.trifold.updates.setEnabled).toHaveBeenCalledWith(true);
  });

  it('shows why the last check failed', () => {
    showing({ asked: true, enabled: true, lastError: 'The release list answered 403' });
    render(<UpdatesCard />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'The last check did not work: The release list answered 403.',
    );
  });
});

describe('UpdateTopBarButton', () => {
  it('appears only while a newer version is out and not dismissed, and opens Settings', async () => {
    showing({ asked: true });
    const { rerender } = render(<UpdateTopBarButton />);
    expect(screen.queryByRole('button', { name: /is available/ })).toBeNull();

    showing({ asked: true, available: found, dismissed: true });
    rerender(<UpdateTopBarButton />);
    expect(screen.queryByRole('button', { name: /is available/ })).toBeNull();

    showing({ asked: true, available: found });
    rerender(<UpdateTopBarButton />);
    const enterLibrary = vi.spyOn(useShellStore.getState(), 'enterLibrary');
    useShellStore.setState({ enterLibrary });
    await userEvent.click(screen.getByRole('button', { name: 'Trifold 0.4.0 is available' }));
    expect(enterLibrary).toHaveBeenCalledWith('settings');
  });
});
