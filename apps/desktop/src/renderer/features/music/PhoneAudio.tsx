import { useEffect, useState } from 'react';
import type { PhoneAudioStatus, SystemPage } from '@trifold/api';
import { isMac } from '../../platform';
import { mergePhones, usePhoneAudioStore, type PhoneRow } from '../../stores/phoneAudioStore';
import { Icon } from '../shell/icons';

/** Opens an OS settings page; says so when this OS has no such page. */
function SystemButton({ page, children }: { page: SystemPage; children: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      disabled={missing}
      title={missing ? 'Not available on this system' : undefined}
      onClick={() => {
        window.trifold.app
          .openSystemPage(page)
          .then((opened) => setMissing(!opened))
          .catch(() => setMissing(true));
      }}
    >
      {children}
    </button>
  );
}

const STATE_LABEL: Record<PhoneAudioStatus['state'], string> = {
  off: '',
  connecting: 'Connecting…',
  connected: 'Playing through this computer',
  reconnecting: 'Reconnecting…',
  failed: 'Could not connect',
};

function PhoneRowView({ row, status }: { row: PhoneRow; status: PhoneAudioStatus }) {
  const connect = usePhoneAudioStore((s) => s.connect);
  const disconnect = usePhoneAudioStore((s) => s.disconnect);
  const forget = usePhoneAudioStore((s) => s.forget);
  const active = status.device?.id === row.id && status.state !== 'off';
  const busy = active && (status.state === 'connecting' || status.state === 'reconnecting');
  return (
    <li className={`phone-row${active ? ' active' : ''}`} data-testid="phone-row">
      <Icon name="music" size={15} />
      <span className="phone-name">
        <strong>{row.name}</strong>
        {active ? (
          <span className={`small ${status.state === 'failed' ? 'warn-text' : 'muted'}`}>
            {STATE_LABEL[status.state]}
            {status.detail ? ` · ${status.detail}` : ''}
          </span>
        ) : row.paired ? (
          <span className="muted small">{row.remembered ? 'Ready' : 'Paired, not used yet'}</span>
        ) : (
          <span className="muted small">Not paired with this computer any more</span>
        )}
      </span>
      <span className="spacer" />
      {active && status.state !== 'failed' ? (
        <button type="button" className="btn small" onClick={() => void disconnect()}>
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          className="btn small primary"
          disabled={!row.paired || busy}
          onClick={() => void connect({ id: row.id, name: row.name })}
        >
          {active ? 'Try again' : 'Connect'}
        </button>
      )}
      {row.remembered && (
        <button
          type="button"
          className="chrome-btn xs"
          onClick={() => void forget(row.id)}
          title="Forget this phone"
          aria-label={`Forget ${row.name}`}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </li>
  );
}

/** Windows: the receiver lives in Trifold; connecting brings up Bluetooth and the audio at once. */
function WindowsReceiver() {
  const status = usePhoneAudioStore((s) => s.status);
  const paired = usePhoneAudioStore((s) => s.paired);
  const searching = usePhoneAudioStore((s) => s.searching);
  const error = usePhoneAudioStore((s) => s.error);
  const refresh = usePhoneAudioStore((s) => s.refresh);
  const rows = mergePhones(status, paired);
  return (
    <>
      <div className="row">
        <h3>Phones</h3>
        <span className="spacer" />
        {searching && <span className="muted small">Looking for paired phones…</span>}
        <button
          type="button"
          className="chrome-btn"
          onClick={() => void refresh()}
          disabled={searching}
          title="Look again for paired phones"
          aria-label="Look again for paired phones"
        >
          <Icon name="refresh" />
        </button>
        <SystemButton page="bluetooth">Pair a new phone…</SystemButton>
      </div>
      {error && (
        <p className="warn-text small" role="alert">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="muted">
          {searching
            ? ''
            : 'No paired phones yet. Pair the phone once in Bluetooth settings; it then shows up here and connects in one click.'}
        </p>
      ) : (
        <ul className="phone-list">
          {rows.map((row) => (
            <PhoneRowView key={row.id} row={row} status={status} />
          ))}
        </ul>
      )}
      <p className="muted small">
        Connect brings up the Bluetooth link and the audio together; everything playing on the phone
        then comes out of this computer. Needs Windows 11. Media only, no calls.
      </p>
    </>
  );
}

function MacGuide() {
  return (
    <>
      <h3>AirPlay (iPhone or iPad)</h3>
      <ol className="steps">
        <li>
          Turn on <strong>AirPlay Receiver</strong> in AirDrop &amp; Handoff. Allow it for everyone
          on the same network if the phone uses a different Apple account.{' '}
          <SystemButton page="airplay">Open AirPlay settings</SystemButton>
        </li>
        <li>
          On the phone: Control Center, press and hold the audio card, tap the AirPlay icon and
          choose this Mac. Every app on the phone then plays here.
        </li>
      </ol>
      <p className="muted small">
        Needs macOS 12 or later and the same Wi-Fi. Android phones cannot AirPlay; a cable or a
        Wi-Fi audio app on both devices does it instead.
      </p>
    </>
  );
}

/**
 * "Phone audio" (ADR 0007): make this computer the phone's speaker, so Spotify, a soundscape
 * app or anything else on the phone plays through the table speakers while the phone stays the
 * remote. On Windows the receiver is Trifold's own; on macOS the OS does it through AirPlay.
 */
export function PhoneAudio() {
  const load = usePhoneAudioStore((s) => s.load);
  const refresh = usePhoneAudioStore((s) => s.refresh);
  useEffect(() => {
    if (!isMac) void load().then(refresh);
  }, [load, refresh]);
  return (
    <div className="card wide-card phone-audio" data-testid="phone-audio">
      <p>
        Play from any app on the phone and hear it through this computer. The phone is the remote;
        Trifold's own player stays paused while Phone is chosen.
      </p>
      {isMac ? <MacGuide /> : <WindowsReceiver />}
      <h3>Good to know</h3>
      <ul className="notes">
        <li>
          Phone audio uses the system's default output, not the device chosen in Trifold's Output
          menu, and Trifold's panic mute does not reach it. Set the system output to the table
          speakers. <SystemButton page="sound">Open sound settings</SystemButton>
        </li>
      </ul>
    </div>
  );
}
