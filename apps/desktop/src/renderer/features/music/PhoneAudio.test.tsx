import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhoneAudioStatus } from '@trifold/api';

const iphone = { id: 'bt-1', name: "Ian's iPhone" };
const pixel = { id: 'bt-2', name: 'Pixel' };

afterEach(() => {
  vi.doUnmock('../../platform');
  vi.resetModules();
});

async function renderOn(mac: boolean) {
  vi.doMock('../../platform', () => ({ isMac: mac, hk: (c: string) => c }));
  const { PhoneAudio } = await import('./PhoneAudio');
  const { usePhoneAudioStore } = await import('../../stores/phoneAudioStore');
  render(<PhoneAudio />);
  return usePhoneAudioStore;
}

const status = (patch: Partial<PhoneAudioStatus>): PhoneAudioStatus => ({
  supported: true,
  state: 'off',
  device: null,
  detail: null,
  remembered: [],
  source: 'phone',
  ...patch,
});

describe('PhoneAudio on Windows', () => {
  it('lists remembered phones first, connects in one click and forgets', async () => {
    vi.mocked(window.trifold.phoneAudio.status).mockResolvedValue(
      status({ remembered: [{ ...iphone, lastConnectedAt: '2026-11-06T00:00:00.000Z' }] }),
    );
    vi.mocked(window.trifold.phoneAudio.listDevices).mockResolvedValue([pixel, iphone]);
    await renderOn(false);
    await waitFor(() => expect(screen.getAllByTestId('phone-row')).toHaveLength(2));
    const rows = screen.getAllByTestId('phone-row');
    expect(rows[0]).toHaveTextContent("Ian's iPhone");
    expect(rows[0]).toHaveTextContent('Ready');
    expect(rows[1]).toHaveTextContent('Pixel');
    expect(rows[1]).toHaveTextContent('Paired, not used yet');

    // Main answers with the phone remembered (it is, from the attempt on), so Forget stays.
    vi.mocked(window.trifold.phoneAudio.connect).mockResolvedValue(
      status({
        state: 'connecting',
        device: iphone,
        remembered: [{ ...iphone, lastConnectedAt: '2026-11-06T00:00:00.000Z' }],
      }),
    );
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Connect' }));
    expect(window.trifold.phoneAudio.connect).toHaveBeenCalledWith(iphone);
    expect(rows[0]).toHaveTextContent('Connecting…');
    await userEvent.click(screen.getByRole('button', { name: "Forget Ian's iPhone" }));
    expect(window.trifold.phoneAudio.forget).toHaveBeenCalledWith('bt-1');
  });

  it('shows the live state from main and offers Disconnect while connected', async () => {
    vi.mocked(window.trifold.phoneAudio.listDevices).mockResolvedValue([iphone]);
    const store = await renderOn(false);
    await waitFor(() => expect(screen.getAllByTestId('phone-row')).toHaveLength(1));
    act(() => store.setState({ status: status({ state: 'connected', device: iphone }) }));
    expect(screen.getByTestId('phone-row')).toHaveTextContent('Playing through this computer');
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(window.trifold.phoneAudio.disconnect).toHaveBeenCalled();

    act(() =>
      store.setState({
        status: status({ state: 'failed', device: iphone, detail: 'The phone did not answer.' }),
      }),
    );
    expect(screen.getByTestId('phone-row')).toHaveTextContent('The phone did not answer.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('keeps a remembered phone that is no longer paired, but cannot connect it', async () => {
    vi.mocked(window.trifold.phoneAudio.status).mockResolvedValue(
      status({ remembered: [{ ...pixel, lastConnectedAt: '2026-11-06T00:00:00.000Z' }] }),
    );
    vi.mocked(window.trifold.phoneAudio.listDevices).mockResolvedValue([]);
    await renderOn(false);
    await waitFor(() => expect(screen.getByTestId('phone-row')).toHaveTextContent('Not paired'));
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Pair a new phone…' }));
    expect(window.trifold.app.openSystemPage).toHaveBeenCalledWith('bluetooth');
  });
});

describe('PhoneAudio on macOS', () => {
  it('shows the AirPlay guide and never asks main for Bluetooth phones', async () => {
    await renderOn(true);
    expect(screen.getByRole('heading', { name: 'AirPlay (iPhone or iPad)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Phones' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open AirPlay settings' }));
    expect(window.trifold.app.openSystemPage).toHaveBeenCalledWith('airplay');
    expect(window.trifold.phoneAudio.listDevices).not.toHaveBeenCalled();
  });
});
