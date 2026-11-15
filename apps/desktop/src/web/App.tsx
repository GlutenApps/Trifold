import { useEffect, useState } from 'react';
import type { ClientView, CreatureView, PickerEntry } from '@trifold/api';
import { readLabel, saveLabel, useConnection, type Connection } from './connection';
import { MapView } from './MapView';

/**
 * The player connector's page (docs/PLAYER-CONNECTOR.md, Phase 1): join, pick a character, then
 * the live map and the character's numbers, read-only. Mobile first, from 360 px wide, with
 * 44 px touch targets and nothing that needs hover.
 */
export function App() {
  const conn = useConnection();
  const { view } = conn;

  return (
    <div className="pc-app">
      <header className="pc-top">
        <span className="pc-brand">{view?.campaignName || 'Trifold'}</span>
        <LinkDot link={conn.link} />
      </header>
      {conn.error && (
        <div className="pc-banner" role="alert">
          <span>{conn.error}</span>
          <button type="button" className="pc-btn ghost" onClick={conn.clearError}>
            OK
          </button>
        </div>
      )}
      {!view ? (
        <Joining link={conn.link} />
      ) : view.mine.length ? (
        <Playing view={view} />
      ) : (
        <Picker entries={view.picker} conn={conn} />
      )}
    </div>
  );
}

function LinkDot({ link }: { link: Connection['link'] }) {
  const text =
    link === 'open'
      ? 'Connected'
      : link === 'stopped'
        ? 'The DM stopped the table'
        : link === 'connecting'
          ? 'Connecting…'
          : 'Reconnecting…';
  return (
    <span className={`pc-link ${link}`} role="status">
      <span className="pc-dot" aria-hidden="true" />
      {text}
    </span>
  );
}

function Joining({ link }: { link: Connection['link'] }) {
  return (
    <main className="pc-center">
      <p className="pc-lead">
        {link === 'stopped' ? 'The table is closed for now.' : 'Joining the table…'}
      </p>
      <p className="pc-hint">
        Not connecting? Guest and school Wi-Fi often block devices from reaching each other. A phone
        hotspot works.
      </p>
    </main>
  );
}

function Portrait({ url, name, size }: { url?: string | undefined; name: string; size: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span className="pc-portrait" style={{ width: size, height: size }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>{initials}</span>}
    </span>
  );
}

function Picker({ entries, conn }: { entries: PickerEntry[]; conn: Connection }) {
  const [label, setLabel] = useState(readLabel);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (conn.error) setBusy(null);
  }, [conn.error]);

  const claim = (e: PickerEntry) => {
    saveLabel(label);
    setBusy(`${e.kind}:${e.id}`);
    conn.send({
      type: 'claim',
      creatureKind: e.kind,
      creatureId: e.id,
      ...(label.trim() ? { label: label.trim() } : {}),
    });
  };

  return (
    <main className="pc-scroll">
      <h1 className="pc-title">Pick your character</h1>
      {entries.length === 0 ? (
        <p className="pc-hint">The DM hasn’t opened any characters to players yet.</p>
      ) : (
        <ul className="pc-pick-list">
          {entries.map((e) => (
            <li key={`${e.kind}:${e.id}`}>
              <button
                type="button"
                className="pc-pick"
                disabled={e.inUse || busy !== null || conn.link !== 'open'}
                onClick={() => claim(e)}
              >
                <Portrait url={e.portraitUrl} name={e.name} size={44} />
                <span className="pc-pick-name">{e.name}</span>
                {e.inUse && <span className="pc-tag">In use</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="pc-field">
        <span>This device’s name (optional)</span>
        <input
          value={label}
          maxLength={40}
          placeholder="Sam’s phone"
          onChange={(ev) => setLabel(ev.target.value)}
        />
      </label>
    </main>
  );
}

function Playing({ view }: { view: ClientView }) {
  const [selected, setSelected] = useState<string>(() => key(view.mine[0]!));
  const current = view.mine.find((c) => key(c) === selected) ?? view.mine[0]!;
  return (
    <main className="pc-play">
      {view.mine.length > 1 && (
        <nav className="pc-chips" aria-label="Your characters">
          {view.mine.map((c) => (
            <button
              key={key(c)}
              type="button"
              className={`pc-chip${key(c) === key(current) ? ' on' : ''}`}
              aria-pressed={key(c) === key(current)}
              onClick={() => setSelected(key(c))}
            >
              <Portrait url={c.portraitUrl} name={c.name} size={28} />
              {c.name}
            </button>
          ))}
        </nav>
      )}
      {view.map ? (
        <MapView
          map={view.map}
          selectedTokenId={current.tokenId ?? null}
          onSelectToken={(tokenId) => {
            const hit = view.mine.find((c) => c.tokenId === tokenId);
            if (hit) setSelected(key(hit));
          }}
        />
      ) : (
        <div className="pc-map pc-center">
          <p className="pc-hint">No map right now.</p>
        </div>
      )}
      <Stats creature={current} />
    </main>
  );
}

const key = (c: Pick<CreatureView, 'kind' | 'id'>) => `${c.kind}:${c.id}`;

function Stats({ creature }: { creature: CreatureView }) {
  const hp = creature.hp;
  const ratio = hp && hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : null;
  const band =
    ratio === null ? '' : hp!.current <= 0 ? 'down' : ratio <= 0.5 ? 'bloodied' : 'healthy';
  return (
    <section className="pc-stats" aria-label={`${creature.name}’s numbers`}>
      <div className="pc-stats-head">
        <Portrait url={creature.portraitUrl} name={creature.name} size={40} />
        <h2>{creature.name}</h2>
      </div>
      <dl className="pc-stat-row">
        <div className={`pc-stat hp ${band}`}>
          <dt>HP</dt>
          <dd>
            {hp ? (
              <>
                <span className="pc-num">{hp.current}</span>
                <span className="pc-of">/ {hp.max}</span>
              </>
            ) : (
              '—'
            )}
          </dd>
          {ratio !== null && (
            <span className="pc-bar" aria-hidden="true">
              <span style={{ width: `${ratio * 100}%` }} />
            </span>
          )}
        </div>
        <div className="pc-stat">
          <dt>Temp</dt>
          <dd className="pc-num">{hp ? hp.temp : '—'}</dd>
        </div>
        <div className="pc-stat">
          <dt>AC</dt>
          <dd className="pc-num">{creature.ac ?? '—'}</dd>
        </div>
      </dl>
      <div className="pc-conditions">
        {creature.conditions.length ? (
          creature.conditions.map((c) => (
            <span key={c} className="pc-tag">
              {c}
            </span>
          ))
        ) : (
          <span className="pc-hint">No conditions</span>
        )}
      </div>
    </section>
  );
}
