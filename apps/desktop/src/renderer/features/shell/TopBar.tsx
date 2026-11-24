import { useEffect, useRef, useState } from 'react';
import { useCampaignStore } from '../../stores/campaignStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { presetsFor, useShellStore } from '../../stores/shellStore';
import { closeCampaign, openJoined, switchCampaign } from './campaignFlow';
import { GlobalSearch } from './GlobalSearch';
import { Icon } from './icons';
import { BrandMark, BrandWordmark } from './Brand';
import { hk } from '../../platform';
import { UpdateTopBarButton } from '../settings/Updates';

/** The mark's height in the bar, the same with or without the name beside it. */
const MARK = 22;

/**
 * The frameless window's title bar (ADR 0004, top bar): mark → Library (the full lockup, with the
 * name, while in the Library), campaign breadcrumb → switcher, the global search in the middle
 * (ADR 0017), current layout, Hotkeys, Settings. Layouts and Hotkeys pop up from their buttons
 * (ADR 0009); the dock collapses from its own header, never from here. Windows draws the window
 * controls over the right end, so the bar leaves that space free.
 *
 * A joined campaign's player console (docs/PLAYER-MODE.md) has the same bar: the switcher, its
 * own layouts and Settings, without Hotkeys. The switcher lists both kinds of campaign, Running
 * and Playing, so moving between running a game and playing in one is one pick.
 */
export function TopBar() {
  const space = useShellStore((s) => s.space);
  const campaignSlug = useShellStore((s) => s.campaignSlug);
  const enterLibrary = useShellStore((s) => s.enterLibrary);
  const enterConsole = useShellStore((s) => s.enterConsole);
  const pop = useShellStore((s) => s.pop);
  const togglePop = useShellStore((s) => s.togglePop);
  const role = useShellStore((s) => s.role);
  const gmPresets = useShellStore((s) => s.presets);
  const playerPresets = useShellStore((s) => s.playerPresets);
  const layout = useShellStore((s) => s.layout);
  const currentIndex = useShellStore((s) => s.currentPresetIndex)();
  const current = useCampaignStore((s) => s.current);
  const joined = useJoinedStore((s) => s.current);
  const joinedList = useJoinedStore((s) => s.joined);
  const closeJoined = useJoinedStore((s) => s.closeCampaign);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const importXml = useCampaignStore((s) => s.importXml);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // The current layout is read through currentPresetIndex; subscribing re-renders on a change.
  void layout;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const presets = presetsFor(role, gmPresets, playerPresets);
  const preset = currentIndex >= 0 ? presets[currentIndex] : null;
  const playing = space === 'console' && !!joined;
  const inConsole = space === 'console' && (!!current || playing);
  const joinedName = joined ? joined.campaignName || 'Unnamed campaign' : '';
  const campaignName = joined ? joinedName : (current?.campaign.name ?? '');
  // Headings only when the Library has both kinds; otherwise the list speaks for itself.
  const grouped = campaigns.length > 0 && joinedList.length > 0;

  /** Runs a menu choice and closes the menu. */
  const pick = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const toggleMenu = () => {
    // Joining happens in the Library; refresh the list so a campaign joined since is offered.
    if (!menuOpen) void useJoinedStore.getState().load();
    setMenuOpen((v) => !v);
  };

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-start">
        <button
          type="button"
          className="topbar-mark"
          aria-label="Library"
          title="Library"
          onClick={() => enterLibrary()}
        >
          {/* The mark never changes; in a campaign the switcher needs the room, so the name goes. */}
          <BrandMark size={MARK} />
          {!inConsole && <BrandWordmark markSize={MARK} />}
        </button>
        {inConsole ? (
          <div className="crumbs" ref={menuRef}>
            <span className="muted">›</span>
            <button
              type="button"
              className="crumb"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Campaign: ${campaignName}`}
              onClick={toggleMenu}
            >
              <span className="crumb-name" data-testid={playing ? 'joined-crumb' : undefined}>
                {campaignName}
              </span>
              <span className="badge">
                {playing ? 'playing' : `${current?.campaign.preferredEdition} rules`}
              </span>
              <Icon name="down" size={12} />
            </button>
            {menuOpen && (
              <div className="menu switcher" role="menu" aria-label="Campaigns">
                {campaigns.length > 0 && (
                  <div role="group" aria-label="Running" className="switcher-group">
                    {grouped && (
                      <div className="switcher-heading" aria-hidden="true">
                        Running
                      </div>
                    )}
                    {campaigns.map((c) => {
                      const isCurrent = !playing && c.id === current?.campaign.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="menuitem"
                          onClick={pick(() => switchCampaign(c.id))}
                        >
                          <span className={`check${isCurrent ? ' on' : ''}`}>
                            {isCurrent ? '✓' : ''}
                          </span>
                          <span className="grow switcher-name" title={c.name}>
                            {c.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {joinedList.length > 0 && (
                  <div role="group" aria-label="Playing" className="switcher-group">
                    {grouped && (
                      <div className="switcher-heading" aria-hidden="true">
                        Playing
                      </div>
                    )}
                    {joinedList.map((j) => {
                      const isCurrent = playing && j.campaignId === joined?.campaignId;
                      const name = j.campaignName || 'Unnamed campaign';
                      return (
                        <button
                          key={j.campaignId}
                          type="button"
                          role="menuitem"
                          onClick={pick(() => openJoined(j.campaignId))}
                        >
                          <span className={`check${isCurrent ? ' on' : ''}`}>
                            {isCurrent ? '✓' : ''}
                          </span>
                          <span className="grow switcher-name" title={name}>
                            {name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="menu-sep" />
                {playing ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={pick(() => {
                        useJoinedStore.setState({ wantsJoin: true });
                        enterLibrary('campaigns');
                      })}
                    >
                      Join a campaign…
                    </button>
                    <button type="button" role="menuitem" onClick={pick(closeJoined)}>
                      Close campaign
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={pick(() => enterLibrary('campaigns'))}
                    >
                      New campaign…
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={pick(() => void importXml('new'))}
                    >
                      Import Game Master XML…
                    </button>
                    <button type="button" role="menuitem" onClick={pick(closeCampaign)}>
                      Close campaign
                    </button>
                  </>
                )}
                <div className="menu-sep" />
                <button type="button" role="menuitem" onClick={pick(() => enterLibrary())}>
                  Library ›
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <span className="muted">›</span>
            <span className="topbar-title">Library</span>
          </>
        )}
      </div>
      {/* The middle column: the search stays centred on the window however wide the sides get. */}
      <div className="topbar-center">
        {(inConsole || (space === 'library' && campaigns.length > 0)) && <GlobalSearch />}
      </div>
      <div className="topbar-end">
        <UpdateTopBarButton />
        {inConsole ? (
          <>
            <button
              type="button"
              className={`btn ghost${pop === 'layouts' ? ' on' : ''}`}
              aria-label="Layouts"
              aria-haspopup="dialog"
              aria-expanded={pop === 'layouts'}
              data-pop="layouts"
              title="Layouts"
              onClick={() => togglePop('layouts')}
            >
              <Icon name="layout" />
              <span className="topbar-label">{preset ? preset.name : 'No layout'}</span>
              {preset && currentIndex < 9 && (
                <kbd className="kbd">{hk(`Ctrl+${currentIndex + 1}`)}</kbd>
              )}
            </button>
            {/* The hotkey sheet lists the GM's keys; a player console leaves it out for now. */}
            {!playing && (
              <button
                type="button"
                className={`btn ghost${pop === 'hotkeys' ? ' on' : ''}`}
                aria-label="Hotkeys"
                aria-haspopup="dialog"
                aria-expanded={pop === 'hotkeys'}
                data-pop="hotkeys"
                title={`Hotkeys (${hk('Ctrl+/')})`}
                onClick={() => togglePop('hotkeys')}
              >
                <Icon name="keys" />
                <span className="topbar-label hotkeys-label">Hotkeys</span>
              </button>
            )}
            <button
              type="button"
              className="chrome-btn"
              aria-label="Settings"
              title={`Settings, in the Library (${hk('Ctrl+,')})`}
              onClick={() => enterLibrary('settings')}
            >
              <Icon name="settings" />
            </button>
          </>
        ) : joined ? (
          <button type="button" className="btn" onClick={() => openJoined(joined.campaignId)}>
            Back to {joinedName} <span className="pip" />
          </button>
        ) : (
          current &&
          campaignSlug && (
            <button type="button" className="btn" onClick={() => enterConsole(campaignSlug)}>
              Back to {current.campaign.name} <span className="pip" />
            </button>
          )
        )}
        <span className="window-controls-space" aria-hidden="true" />
      </div>
    </header>
  );
}
