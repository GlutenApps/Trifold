import { useEffect, useState } from 'react';
import { createWebSocketClient, useConnection, type Connection } from './connection';
import { Picker } from './Picker';
import { Playing } from './Playing';
import { useLayout } from './useLayout';

/**
 * The player connector's page (docs/PLAYER-CONNECTOR.md): join, pick a character, then the live
 * map and the character's numbers, which the player can change. Mobile first, from
 * 360 px wide, with 44 px touch targets and nothing that needs hover.
 */
export function App() {
  const [client] = useState(createWebSocketClient);
  const conn = useConnection(client);
  const { view } = conn;
  const layout = useLayout();
  const playing = !!view?.mine.length;

  const switchButton = playing && (
    <button
      type="button"
      className="pc-btn ghost pc-switch"
      aria-label="Switch character"
      title="Switch character"
      onClick={() => conn.send({ type: 'switch' })}
    >
      Switch
    </button>
  );
  const title = (
    <span className="pc-title-block">
      <span className="pc-brand">{view?.campaignName || 'Trifold'}</span>
      <LinkDot link={conn.link} />
    </span>
  );
  // Phone landscape gives the map the full height: name and Switch float on it as pills.
  const floating = playing && layout === 'phoneLandscape';

  return (
    <div className="pc-app">
      {!floating && (
        <header className="pc-top">
          {title}
          {switchButton}
        </header>
      )}
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
        <Playing
          view={view}
          conn={conn}
          layout={layout}
          header={
            <>
              {title}
              {switchButton}
            </>
          }
        />
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
