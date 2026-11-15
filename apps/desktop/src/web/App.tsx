import { useEffect, useState } from 'react';
import type { ClientView, CreatureView } from '@trifold/api';
import { useConnection, type Connection } from './connection';
import { MapView } from './MapView';
import { Picker } from './Picker';
import { Portrait } from './Portrait';
import { Stats } from './Stats';

/**
 * The player connector's page (docs/PLAYER-CONNECTOR.md): join, pick a character, then the live
 * map and the character's numbers, which the player can change (Phase 2). Mobile first, from
 * 360 px wide, with 44 px touch targets and nothing that needs hover.
 */
export function App() {
  const conn = useConnection();
  const { view } = conn;
  const playing = !!view?.mine.length;

  return (
    <div className="pc-app">
      <header className="pc-top">
        <span className="pc-brand">{view?.campaignName || 'Trifold'}</span>
        <LinkDot link={conn.link} />
        {playing && (
          <button
            type="button"
            className="pc-btn ghost pc-switch"
            aria-label="Switch character"
            title="Switch character"
            onClick={() => conn.send({ type: 'switch' })}
          >
            Switch
          </button>
        )}
      </header>
      {conn.error && (
        <div className="pc-banner" role="alert">
          <span>{conn.error}</span>
          <button type="button" className="pc-btn ghost" onClick={conn.clearError}>
            OK
          </button>
        </div>
      )}
      <ReleasedBanner conn={conn} />
      {!view ? (
        <Joining link={conn.link} />
      ) : playing ? (
        <Playing view={view} conn={conn} />
      ) : (
        <Picker view={view} conn={conn} />
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

/** "Released Brannoc · Undo" for a few seconds after Switch character. */
function ReleasedBanner({ conn }: { conn: Connection }) {
  const { released, clearReleased } = conn;
  useEffect(() => {
    if (!released) return;
    const t = window.setTimeout(clearReleased, Math.max(0, released.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [released, clearReleased]);
  if (!released) return null;
  return (
    <div className="pc-banner" role="status">
      <span>Released {released.names.join(', ')}</span>
      <button
        type="button"
        className="pc-btn"
        onClick={() => {
          conn.send({ type: 'undo' });
          clearReleased();
        }}
      >
        Undo
      </button>
    </div>
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

function Playing({ view, conn }: { view: ClientView; conn: Connection }) {
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
      <Stats key={key(current)} creature={current} conn={conn} />
    </main>
  );
}

const key = (c: Pick<CreatureView, 'kind' | 'id'>) => `${c.kind}:${c.id}`;
