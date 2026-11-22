import { useEffect, useState } from 'react';
import type { ClientView, PickerEntry } from '@trifold/api';
import { readLabel, saveLabel, type Connection } from './connection';
import { Portrait } from './Portrait';

/**
 * Pick your character (Claiming, reclaiming and releasing). A free character is claimed with a
 * tap, or after choosing a PIN in PIN mode. One in use can be got back too: held by a device that
 * is offline it is a reclaim, held by one that is online the page asks first whether to take it
 * over. Either way the campaign's reclaim mode decides: at once, with the PIN, or after the DM
 * says yes.
 */
export function Picker({
  view,
  conn,
  deviceName,
}: {
  view: ClientView;
  conn: Connection;
  /**
   * The name this device goes by when its host already knows it (the player console,
   * PLAYER-MODE.md). Absent, the page asks for one and remembers it in the browser.
   */
  deviceName?: string;
}) {
  const [typed, setLabel] = useState(readLabel);
  const label = deviceName ?? typed;
  const [busy, setBusy] = useState(false);
  /** The character being asked about: a takeover to confirm, or a PIN to type. */
  const [asking, setAsking] = useState<{ entry: PickerEntry; step: 'takeover' | 'pin' } | null>(
    null,
  );
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (conn.error) {
      setBusy(false);
      // The server asks for a PIN the page did not know it needed (or a wrong one): ask again.
      if (/PIN/.test(conn.error) && asking) setAsking({ ...asking, step: 'pin' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.error]);

  const send = (entry: PickerEntry, withPin?: string) => {
    if (deviceName === undefined) saveLabel(label);
    setBusy(true);
    conn.clearError();
    conn.send({
      type: 'claim',
      creatureKind: entry.kind,
      creatureId: entry.id,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(withPin ? { pin: withPin } : {}),
    });
  };

  const tap = (entry: PickerEntry) => {
    setPin('');
    if (entry.inUse && entry.holderOnline) return setAsking({ entry, step: 'takeover' });
    if (view.reclaimMode === 'pin') return setAsking({ entry, step: 'pin' });
    send(entry);
  };

  if (conn.waiting) {
    return (
      <main className="pc-center">
        <p className="pc-lead">Asked the DM for {conn.waiting}…</p>
        <p className="pc-hint">This page moves on as soon as the DM says yes.</p>
        <button
          type="button"
          className="pc-btn"
          onClick={() => {
            conn.send({ type: 'cancel' });
            setBusy(false);
          }}
        >
          Cancel
        </button>
      </main>
    );
  }

  if (asking?.step === 'takeover') {
    const { entry } = asking;
    return (
      <main className="pc-center">
        <p className="pc-lead">{entry.name} is in use on another device. Take over?</p>
        <div className="pc-row">
          <button type="button" className="pc-btn" onClick={() => setAsking(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="pc-btn primary"
            onClick={() => {
              if (view.reclaimMode === 'pin') return setAsking({ entry, step: 'pin' });
              setAsking(null);
              send(entry);
            }}
          >
            Take over
          </button>
        </div>
      </main>
    );
  }

  if (asking?.step === 'pin') {
    const { entry } = asking;
    const setting = !entry.inUse;
    return (
      <main className="pc-center">
        <form
          className="pc-pin"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{4}$/.test(pin)) send(entry, pin);
          }}
        >
          <label className="pc-field">
            <span>
              {setting
                ? `Choose a 4-digit PIN for ${entry.name}. You’ll need it to get them back on another device.`
                : `Enter ${entry.name}’s PIN.`}
            </span>
            <input
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              aria-label="PIN"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>
          <div className="pc-row">
            <button type="button" className="pc-btn" onClick={() => setAsking(null)}>
              Cancel
            </button>
            <button type="submit" className="pc-btn primary" disabled={pin.length !== 4 || busy}>
              {setting ? 'Set PIN' : 'Continue'}
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="pc-scroll">
      <h1 className="pc-title">Pick your character</h1>
      {view.picker.length === 0 ? (
        <p className="pc-hint">The DM hasn’t opened any characters to players yet.</p>
      ) : (
        <ul className="pc-pick-list">
          {view.picker.map((e) => (
            <li key={`${e.kind}:${e.id}`}>
              <button
                type="button"
                className="pc-pick"
                disabled={busy || conn.link !== 'open'}
                onClick={() => tap(e)}
              >
                <Portrait url={e.portraitUrl} name={e.name} size={44} />
                <span className="pc-pick-name">{e.name}</span>
                {e.inUse && <span className="pc-tag">In use</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {deviceName === undefined && (
        <label className="pc-field">
          <span>This device’s name (optional)</span>
          <input
            value={label}
            maxLength={40}
            placeholder="Sam’s phone"
            onChange={(ev) => setLabel(ev.target.value)}
          />
        </label>
      )}
    </main>
  );
}
