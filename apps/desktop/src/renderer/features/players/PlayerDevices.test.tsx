import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialPresenterState, type TableStatus } from '@trifold/api';
import { useCampaignStore } from '../../stores/campaignStore';
import { useTableStore } from '../../stores/tableStore';
import { TABLE_OFF } from '../../test/setup';
import { PlayerScreen } from '../presenter/PlayerScreen';
import { PlayerAccess } from './PlayerAccess';
import { PlayerDevicesPop } from './PlayerDevices';

const ON: TableStatus = {
  ...TABLE_OFF,
  state: 'on',
  campaignId: 'c1',
  port: 8130,
  urls: ['http://192.168.1.23:8130', 'http://172.20.48.1:8130'],
  localUrl: 'http://trifold.local:8130',
  startedAt: new Date().toISOString(),
  anyConnected: true,
  connections: 1,
  devices: [
    {
      deviceId: 'd1',
      label: 'Sam’s phone',
      online: true,
      lastSeen: new Date().toISOString(),
      claims: [{ kind: 'pc', id: 'brannoc', name: 'Brannoc Hale' }],
    },
  ],
};

function openCampaign() {
  useCampaignStore.setState({
    current: {
      campaign: { id: 'c1', slug: 'g', name: 'Greyford', settings: { tokenStyle: 'engraved' } },
      pcs: [],
      npcs: [],
      scenes: [],
      encounters: [],
      notes: [],
      adventures: [],
      counters: [],
      timers: [],
      pinnedRolls: [],
      sessions: [],
    } as never,
  });
}

function Pop() {
  return <PlayerDevicesPop open onToggle={() => undefined} onClose={() => undefined} />;
}

describe('Player devices pop-up', () => {
  beforeEach(() => {
    openCampaign();
    useTableStore.setState({ status: TABLE_OFF, joinOnTv: false, error: null });
  });

  it('starts the server for the open campaign', async () => {
    render(<Pop />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Let players join' }));
    });
    expect(window.trifold.table.start).toHaveBeenCalledWith('c1');
  });

  it('shows the QR, the local name, the IP and the devices while on', () => {
    useTableStore.setState({ status: ON });
    render(<Pop />);
    expect(
      screen.getByRole('img', { name: /QR code for http:\/\/192\.168\.1\.23:8130/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('http://trifold.local:8130')).toBeInTheDocument();
    expect(screen.getByText('http://192.168.1.23:8130')).toBeInTheDocument();
    expect(screen.getByText('Sam’s phone')).toBeInTheDocument();
    expect(screen.getByText('Brannoc Hale')).toBeInTheDocument();
  });

  it('releases one creature, all of them, and stops', async () => {
    useTableStore.setState({ status: ON });
    render(<Pop />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release Brannoc Hale' }));
    });
    expect(window.trifold.table.release).toHaveBeenCalledWith({ kind: 'pc', id: 'brannoc' });
    act(() => useTableStore.setState({ status: ON }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release all' }));
    });
    expect(window.trifold.table.release).toHaveBeenCalledWith('all');
    act(() => useTableStore.setState({ status: ON }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    expect(window.trifold.table.stop).toHaveBeenCalled();
  });

  it('ticks Show join code on TV', () => {
    useTableStore.setState({ status: ON });
    render(<Pop />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show join code on TV' }));
    expect(useTableStore.getState().joinOnTv).toBe(true);
  });

  it('suggests the firewall or the Wi-Fi when nobody connects for a minute', () => {
    useTableStore.setState({
      status: {
        ...ON,
        anyConnected: false,
        devices: [],
        connections: 0,
        startedAt: '2020-01-01T00:00:00.000Z',
      },
    });
    render(<Pop />);
    expect(screen.getByText(/No one has connected yet/)).toBeInTheDocument();
  });
});

describe('Player devices pop-up', () => {
  beforeEach(() => {
    openCampaign();
  });

  const waiting: TableStatus = {
    ...ON,
    reclaimMode: 'approval',
    approvals: [
      { requestId: 'r1', label: 'Wren’s tablet', creatureName: 'Brannoc Hale', takeover: true },
    ],
  };

  it('lists who is waiting, with Accept and Deny', async () => {
    useTableStore.setState({ status: waiting });
    render(<Pop />);
    expect(screen.getByText('Wren’s tablet wants to take over Brannoc Hale')).toBeInTheDocument();
    expect(screen.getByTestId('devices-waiting')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    });
    expect(window.trifold.table.answer).toHaveBeenCalledWith('r1', true);
    act(() => useTableStore.setState({ status: waiting }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    });
    expect(window.trifold.table.answer).toHaveBeenCalledWith('r1', false);
  });

  it('sets the reclaim mode', async () => {
    useTableStore.setState({ status: ON });
    render(<Pop />);
    const select = screen.getByRole('combobox', { name: 'Getting a character back' });
    expect(select).toHaveValue('open');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'pin' } });
    });
    expect(window.trifold.table.setReclaimMode).toHaveBeenCalledWith('pin');
  });
});

describe('PlayerAccess on the forms', () => {
  it('shows who holds the character and releases it', async () => {
    useTableStore.setState({ status: ON });
    render(
      <PlayerAccess
        kind="pc"
        id="brannoc"
        name="Brannoc Hale"
        checked
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Players can claim this character' }),
    ).toBeChecked();
    expect(screen.getByText(/Claimed by Sam’s phone \(online\)/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    });
    expect(window.trifold.table.release).toHaveBeenCalledWith({ kind: 'pc', id: 'brannoc' });
  });

  it('shows no claim line for an unclaimed character', () => {
    useTableStore.setState({ status: ON });
    render(
      <PlayerAccess
        kind="npc"
        id="tobin"
        name="Tobin Marsh"
        checked={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByText(/Claimed by/)).not.toBeInTheDocument();
  });
});

describe('Join code on the TV', () => {
  it('shows over a blackout and goes when taken down', async () => {
    const { rerender } = render(<PlayerScreen />);
    const listener = (
      window.trifold.on as unknown as { mock: { calls: Array<[string, (s: unknown) => void]> } }
    ).mock.calls.find(([event]) => event === 'presenterState')?.[1];
    expect(listener).toBeTruthy();
    await act(async () => {
      listener!({
        ...initialPresenterState,
        blackout: true,
        joinCode: { url: 'http://192.168.1.23', localUrl: 'http://trifold.local' },
        updatedAt: Date.now(),
      });
    });
    expect(screen.getByTestId('tv-join')).toHaveTextContent('http://trifold.local');
    await act(async () => {
      listener!({
        ...initialPresenterState,
        blackout: true,
        joinCode: null,
        updatedAt: Date.now() + 1,
      });
    });
    rerender(<PlayerScreen />);
    expect(screen.queryByTestId('tv-join')).not.toBeInTheDocument();
  });
});
