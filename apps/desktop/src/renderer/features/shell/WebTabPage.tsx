import { InlineConfirm } from './InlineConfirm';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  normalizeWebUrl,
  WEB_TAB_ICONS,
  WEB_TAB_PARTITION,
  webTabKey,
  type WebTab,
  type WebTabIcon,
} from '@trifold/schema';
import { registerHotkey } from '../../hotkeys';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from './icons';
import { hk } from '../../platform';
import { formatZoom, stepZoom } from './webZoom';

/**
 * A web tab (ADR 0011): the DM's own browser page on the stage. A thin bar (back, forward,
 * reload, home, address, open outside, edit, remove) over Electron's `<webview>`, which runs
 * the page as a sandboxed guest in the shared persistent session. The saved address is the
 * one the DM gave the tab; browsing inside the tab never changes it. Home returns to it, and
 * the edit panel can take the current page as the new saved address.
 */

/** The slice of Electron's webview element this page uses; its types are not in the renderer. */
interface WebviewElement extends HTMLElement {
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  getURL(): string;
  loadURL(url: string): Promise<void>;
  setZoomFactor(factor: number): void;
}

/** React types `<webview>` as a plain element; the guest's methods exist only in Electron. */
function hasGuest(el: HTMLElement | null): el is WebviewElement {
  return !!el && typeof (el as Partial<WebviewElement>).getURL === 'function';
}

interface NavState {
  back: boolean;
  forward: boolean;
  loading: boolean;
}

interface LoadError {
  url: string;
  description: string;
}

interface Draft {
  title: string;
  url: string;
  icon: WebTabIcon;
}

const WEB_TAB_ICON_LABELS: Record<WebTabIcon, string> = {
  globe: 'Globe',
  tome: 'Book',
  person: 'Person',
  scroll: 'Scroll',
  quill: 'Quill',
  crown: 'Crown',
  potion: 'Potion',
  coin: 'Coin',
  compass: 'Compass',
  skull: 'Skull',
  gem: 'Gem',
  star: 'Star',
};

/** The icon choices, as a row of toggle buttons. Shared by the add form and the edit panel. */
export function WebTabIconPicker({
  value,
  onChange,
}: {
  value: WebTabIcon;
  onChange: (icon: WebTabIcon) => void;
}) {
  return (
    <div className="web-icons" role="radiogroup" aria-label="Tab icon">
      {WEB_TAB_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          role="radio"
          className={`chrome-btn${icon === value ? ' on' : ''}`}
          aria-checked={icon === value}
          aria-label={WEB_TAB_ICON_LABELS[icon]}
          title={WEB_TAB_ICON_LABELS[icon]}
          onClick={() => onChange(icon)}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
}

export function WebTabPage({ tab }: { tab: WebTab }) {
  const updateWebTab = useShellStore((s) => s.updateWebTab);
  const removeWebTab = useShellStore((s) => s.removeWebTab);
  const ref = useRef<HTMLWebViewElement>(null);
  /** The page's current address, as shown in the bar. */
  const [address, setAddress] = useState(tab.url);
  const [typed, setTyped] = useState<string | null>(null);
  const [nav, setNav] = useState<NavState>({ back: false, forward: false, loading: false });
  const [error, setError] = useState<LoadError | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Mount the guest once; attributes set through React would reload it on every render.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute('partition', WEB_TAB_PARTITION);
    // Sign-in hand-offs open a pop-up; main decides what each new window may be.
    el.setAttribute('allowpopups', '');
    el.setAttribute('src', tab.url);
    const id = tab.id;
    const sync = () => {
      if (!hasGuest(el)) return;
      setNav((n) => ({ ...n, back: el.canGoBack(), forward: el.canGoForward() }));
    };
    // Only the page itself moves the bar: frames inside it (widgets, hover cards) navigate
    // constantly and are not where the DM is.
    // Chromium keeps zoom per site, so the tab's own factor goes back on after each page.
    const applyZoom = () => {
      const current = useShellStore.getState().webTabs.find((t) => t.id === id);
      if (hasGuest(el) && current) el.setZoomFactor(current.zoom);
    };
    const navigated = (e: Event) => {
      const { url, isMainFrame } = e as Event & { url?: string; isMainFrame?: boolean };
      if (isMainFrame === false) return;
      const next = url ?? (hasGuest(el) ? el.getURL() : '');
      if (next) {
        setAddress(next);
        setError(null);
      }
      applyZoom();
      sync();
    };
    const titled = (e: Event) => {
      const title = (e as Event & { title?: string }).title?.trim();
      const current = useShellStore.getState().webTabs.find((t) => t.id === id);
      if (title && current?.autoTitle && current.title !== title) {
        useShellStore.getState().updateWebTab(id, { title });
      }
    };
    const started = () => setNav((n) => ({ ...n, loading: true }));
    const stopped = () => {
      setNav((n) => ({ ...n, loading: false }));
      sync();
    };
    const failed = (e: Event) => {
      const { errorCode, errorDescription, validatedURL, isMainFrame } = e as Event & {
        errorCode?: number;
        errorDescription?: string;
        validatedURL?: string;
        isMainFrame?: boolean;
      };
      // -3 is ERR_ABORTED: a navigation replaced by another, not a failure to show.
      if (isMainFrame === false || errorCode === -3) return;
      setError({ url: validatedURL ?? address, description: errorDescription ?? 'Load failed' });
    };
    el.addEventListener('dom-ready', applyZoom);
    el.addEventListener('did-navigate', navigated);
    el.addEventListener('did-navigate-in-page', navigated);
    el.addEventListener('page-title-updated', titled);
    el.addEventListener('did-start-loading', started);
    el.addEventListener('did-stop-loading', stopped);
    el.addEventListener('did-fail-load', failed);
    return () => {
      el.removeEventListener('dom-ready', applyZoom);
      el.removeEventListener('did-navigate', navigated);
      el.removeEventListener('did-navigate-in-page', navigated);
      el.removeEventListener('page-title-updated', titled);
      el.removeEventListener('did-start-loading', started);
      el.removeEventListener('did-stop-loading', stopped);
      el.removeEventListener('did-fail-load', failed);
    };
    // The page is mounted for the tab's lifetime; a new address arrives through `go`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  const guest = () => (hasGuest(ref.current) ? ref.current : null);

  const setZoom = (zoom: number) => {
    guest()?.setZoomFactor(zoom);
    updateWebTab(tab.id, { zoom });
  };
  const zoomBy = (direction: 1 | -1) => setZoom(stepZoom(tab.zoom, direction));

  // Ctrl+= / Ctrl+- / Ctrl+0 zoom the tab that is active in the focused group, whether typed
  // on the console or echoed out of the page itself.
  const key = webTabKey(tab.id);
  const current = useShellStore((s) => s.layout.stage.groups[s.focusedGroup]?.active === key);
  useEffect(() => {
    if (!current) return;
    const offs = [
      registerHotkey({
        id: 'web.zoomIn',
        combo: 'Ctrl+=',
        description: 'Zoom the web tab in',
        run: () => zoomBy(1),
      }),
      registerHotkey({
        id: 'web.zoomIn.plus',
        combo: 'Ctrl+Shift++',
        description: 'Zoom the web tab in',
        run: () => zoomBy(1),
      }),
      registerHotkey({
        id: 'web.zoomOut',
        combo: 'Ctrl+-',
        description: 'Zoom the web tab out',
        run: () => zoomBy(-1),
      }),
      registerHotkey({
        id: 'web.zoomReset',
        combo: 'Ctrl+0',
        description: 'Reset the web tab zoom',
        run: () => setZoom(1),
      }),
    ];
    return () => offs.forEach((off) => off());
    // The handlers close over the tab's zoom, so they are refreshed when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, tab.zoom]);

  /** Shows a page in the tab without touching what is saved. */
  const go = (url: string) => {
    setError(null);
    setAddress(url);
    const el = ref.current;
    if (hasGuest(el)) void el.loadURL(url).catch(() => undefined);
    else el?.setAttribute('src', url);
  };

  const submitTyped = () => {
    const url = normalizeWebUrl(typed ?? '');
    setTyped(null);
    if (url) go(url);
  };

  const openEditor = () =>
    setDraft(
      draft ? null : { title: tab.autoTitle ? '' : tab.title, url: tab.url, icon: tab.icon },
    );

  const saveDraft = () => {
    if (!draft) return;
    const url = normalizeWebUrl(draft.url);
    if (!url) return;
    const title = draft.title.trim();
    updateWebTab(tab.id, {
      url,
      icon: draft.icon,
      ...(title ? { title, autoTitle: false } : { autoTitle: true }),
    });
    setDraft(null);
    if (url !== address) go(url);
  };

  const onAddressKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitTyped();
    if (e.key === 'Escape') setTyped(null);
  };
  const onDraftKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveDraft();
    if (e.key === 'Escape') setDraft(null);
  };

  const atHome = address === tab.url;

  return (
    <div className="web-tab">
      <div className="web-bar" role="toolbar" aria-label={`${tab.title} controls`}>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Back"
          title="Back"
          disabled={!nav.back}
          onClick={() => guest()?.goBack()}
        >
          <Icon name="left" />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Forward"
          title="Forward"
          disabled={!nav.forward}
          onClick={() => guest()?.goForward()}
        >
          <Icon name="right" />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label={nav.loading ? 'Stop loading' : 'Reload'}
          title={nav.loading ? 'Stop loading' : 'Reload'}
          onClick={() => (nav.loading ? guest()?.stop() : guest()?.reload())}
        >
          <Icon name={nav.loading ? 'close' : 'refresh'} />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Home"
          title={atHome ? 'At the saved address' : `Back to the saved address: ${tab.url}`}
          disabled={atHome}
          onClick={() => go(tab.url)}
        >
          <Icon name="home" />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Zoom out"
          title={`Zoom out (${hk('Ctrl+-')})`}
          disabled={tab.zoom <= stepZoom(tab.zoom, -1)}
          onClick={() => zoomBy(-1)}
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          className="web-zoom"
          aria-label={`Zoom ${formatZoom(tab.zoom)}, reset`}
          title={`Reset zoom (${hk('Ctrl+0')})`}
          disabled={tab.zoom === 1}
          onClick={() => setZoom(1)}
        >
          {formatZoom(tab.zoom)}
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Zoom in"
          title={`Zoom in (${hk('Ctrl+=')})`}
          disabled={tab.zoom >= stepZoom(tab.zoom, 1)}
          onClick={() => zoomBy(1)}
        >
          <Icon name="plus" />
        </button>
        <input
          type="text"
          className="web-address"
          aria-label="Address"
          spellCheck={false}
          value={typed ?? address}
          onFocus={(e) => {
            setTyped(address);
            e.target.select();
          }}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onAddressKey}
          onBlur={() => setTyped(null)}
        />
        <button
          type="button"
          className="chrome-btn"
          aria-label="Open in system browser"
          title="Open in system browser"
          onClick={() => void window.trifold.app.openExternal(address)}
        >
          <Icon name="external" />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Edit tab"
          title="Edit name, saved address and icon"
          aria-pressed={draft !== null}
          onClick={openEditor}
        >
          <Icon name="pencil" />
        </button>
        {confirmRemove ? (
          <InlineConfirm
            name={tab.title}
            verb="Remove"
            onConfirm={() => removeWebTab(tab.id)}
            onKeep={() => setConfirmRemove(false)}
          />
        ) : (
          <button
            type="button"
            className="chrome-btn danger"
            aria-label="Remove web tab"
            title="Remove this web tab"
            onClick={() => setConfirmRemove(true)}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      {draft && (
        <div className="web-edit" role="group" aria-label="Edit web tab">
          <label className="web-field">
            <span>Name</span>
            <input
              type="text"
              aria-label="Tab name"
              placeholder="Follows the page title when empty"
              value={draft.title}
              autoFocus
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={onDraftKey}
            />
          </label>
          <label className="web-field">
            <span>Saved address</span>
            <input
              type="text"
              aria-label="Saved address"
              spellCheck={false}
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              onKeyDown={onDraftKey}
            />
            <button
              type="button"
              className="btn"
              title="Save the page that is open now as this tab's address"
              disabled={draft.url === address}
              onClick={() => setDraft({ ...draft, url: address })}
            >
              Use current page
            </button>
          </label>
          <div className="web-field">
            <span>Icon</span>
            <WebTabIconPicker
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={!normalizeWebUrl(draft.url)}
              onClick={saveDraft}
            >
              Save
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="web-body">
        <webview ref={ref} className="web-view" />
        {error && (
          <div className="web-error" role="alert">
            <strong>This page did not load</strong>
            <span className="muted small">{error.url}</span>
            <span className="muted small">{error.description}</span>
            <div className="row">
              <button type="button" className="btn" onClick={() => go(error.url)}>
                Try again
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void window.trifold.app.openExternal(error.url)}
              >
                Open in system browser
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
