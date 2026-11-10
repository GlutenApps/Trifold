import { useEffect, useRef, useState } from 'react';
import { useCampaignStore } from '../../stores/campaignStore';
import { useShellStore } from '../../stores/shellStore';
import { closeCampaign, switchCampaign } from './campaignFlow';
import { GlobalSearch } from './GlobalSearch';
import { Icon } from './icons';
import { BrandLockup, BrandMark } from './Brand';
import { hk } from '../../platform';

/**
 * The frameless window's title bar (ADR 0004, top bar): mark → Library (the full lockup, with the
 * name, while in the Library), campaign breadcrumb →
 * switcher, the global search in the middle (ADR 0017), current layout, Hotkeys, Settings. Layouts and Hotkeys pop up from their buttons
 * (ADR 0009); the dock collapses from its own header, never from here. Windows draws the window controls over the right end, so the bar
 * leaves that space free.
 */
export function TopBar() {
  const space = useShellStore((s) => s.space);
  const campaignSlug = useShellStore((s) => s.campaignSlug);
  const enterLibrary = useShellStore((s) => s.enterLibrary);
  const enterConsole = useShellStore((s) => s.enterConsole);
  const pop = useShellStore((s) => s.pop);
  const togglePop = useShellStore((s) => s.togglePop);
  const presets = useShellStore((s) => s.presets);
  const layout = useShellStore((s) => s.layout);
  const currentIndex = useShellStore((s) => s.currentPresetIndex)();
  const current = useCampaignStore((s) => s.current);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const importXml = useCampaignStore((s) => s.importXml);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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

  const preset = currentIndex >= 0 ? presets[currentIndex] : null;
  const inConsole = space === 'console' && current;

  return (
    <header className="topbar" data-testid="topbar">
      <button
        type="button"
        className="topbar-mark"
        aria-label="Library"
        title="Library"
        onClick={() => enterLibrary()}
      >
        {/* In a campaign the switcher needs the room, so the name gives way to the mark. */}
        {inConsole ? (
          <BrandMark size={22} />
        ) : (
          <BrandLockup layout="horizontal" height={24} alt="" />
        )}
      </button>
      {inConsole ? (
        <div className="crumbs" ref={menuRef}>
          <span className="muted">›</span>
          <button
            type="button"
            className="crumb"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Campaign: ${current.campaign.name}`}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="crumb-name">{current.campaign.name}</span>
            <span className="badge">{current.campaign.preferredEdition} rules</span>
            <Icon name="down" size={12} />
          </button>
          {menuOpen && (
            <div className="menu switcher" role="menu" aria-label="Campaigns">
              {campaigns.map((c) => {
                const isCurrent = c.id === current.campaign.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      switchCampaign(c.id);
                    }}
                  >
                    <span className={`check${isCurrent ? ' on' : ''}`}>{isCurrent ? '✓' : ''}</span>
                    <span className="grow switcher-name" title={c.name}>
                      {c.name}
                    </span>
                  </button>
                );
              })}
              <div className="menu-sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  enterLibrary('campaigns');
                }}
              >
                New campaign…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void importXml('new');
                }}
              >
                Import campaign XML…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  closeCampaign();
                }}
              >
                Close campaign
              </button>
              <div className="menu-sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  enterLibrary();
                }}
              >
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
      <span className="spacer drag" />
      {inConsole && (
        <>
          <GlobalSearch />
          <span className="spacer drag" />
        </>
      )}
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
      ) : (
        current &&
        campaignSlug && (
          <button type="button" className="btn" onClick={() => enterConsole(campaignSlug)}>
            Back to {current.campaign.name} <span className="pip" />
          </button>
        )
      )}
      <span className="window-controls-space" aria-hidden="true" />
    </header>
  );
}
