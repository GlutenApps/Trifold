/**
 * Web tabs (ADR 0011): the pure parts of hosting the DM's own browser tabs in the console.
 * The Electron wiring (webview attach guard, session, input forwarding) lives in windows.ts.
 */
import type { WebTabInput } from '@trifold/api';
import { isWebUrl, WEB_TAB_PARTITION } from '@trifold/schema';

export { isWebUrl, WEB_TAB_PARTITION };

/** The Firefox release the web session claims to be. Bump now and then; older is tolerated. */
const FIREFOX_VERSION = '152.0';

/**
 * The user agent the web session presents (ADR 0011). Some sign-in pages refuse what they
 * recognise as an embedded browser. Dropping the Electron token is not enough: Chromium also
 * sends client-hint headers that say "Chromium, not Chrome", and the mismatch is what trips
 * the check. A Firefox string sidesteps it, because Firefox sends no client hints and the
 * pages have nothing to compare. This is the standing practice in multi-service Electron apps,
 * not a guarantee; every web tab keeps "Open in system browser" for the day it stops working.
 */
export function webTabUserAgent(platform: NodeJS.Platform): string {
  const os =
    platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10.15'
      : platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}; rv:${FIREFOX_VERSION}) Gecko/20100101 Firefox/${FIREFOX_VERSION}`;
}

/**
 * What to do when a page inside a web tab asks for a new window. A scripted pop-up (the
 * sign-in hand-off most "Log in with…" buttons use) must stay in the app, in the same session,
 * so the opener gets its result; a link that wants a new tab belongs in the system browser.
 */
export type WindowOpenPlan = 'popup' | 'external' | 'deny';
export function planWindowOpen(url: string, disposition: string): WindowOpenPlan {
  if (disposition === 'new-window') {
    return url === '' || url === 'about:blank' || isWebUrl(url) ? 'popup' : 'deny';
  }
  return isWebUrl(url) ? 'external' : 'deny';
}

/** Electron's `Input` as `before-input-event` reports it; only the fields the hotkeys need. */
export interface GuestInput {
  type: string;
  key: string;
  control: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * A key press inside a web page worth echoing to the console: a key-down with Ctrl, Alt or
 * Cmd held. Plain keys stay with the page, so typing in a document is never intercepted.
 */
export function forwardableInput(input: GuestInput): WebTabInput | null {
  if (input.type !== 'keyDown') return null;
  if (!input.control && !input.alt && !input.meta) return null;
  const { key, control, alt, shift, meta } = input;
  return { key, control, alt, shift, meta };
}
