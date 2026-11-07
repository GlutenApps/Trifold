import { BrowserWindow, screen, session, shell, type Display } from 'electron';
import { join } from 'node:path';
import { EVENT_CHANNELS, type DisplayInfo } from '@trifold/api';
import type { WindowBounds } from '@trifold/schema';
import {
  forwardableInput,
  isWebUrl,
  planWindowOpen,
  WEB_TAB_PARTITION,
  webTabUserAgent,
} from './webTabs';

export type Route = 'console' | 'player';

export interface WindowHooks {
  onConsoleClosing(bounds: WindowBounds): void;
  onPlayerChanged(open: boolean): void;
  onPlayerReady(): void;
}

function boundsOf(win: BrowserWindow): WindowBounds {
  return { ...win.getNormalBounds(), maximized: win.isMaximized() };
}

function isOnScreen(b: WindowBounds): boolean {
  const area = screen.getDisplayMatching(b).workArea;
  return (
    b.x < area.x + area.width &&
    b.x + b.width > area.x &&
    b.y < area.y + area.height &&
    b.y + b.height > area.y
  );
}

/**
 * Console (DM) and player (TV) windows (DESIGN.md §4.1). Both load the same bundle with a
 * different hash route (ADR 0002). The player window never takes focus from the console.
 */
export class WindowManager {
  private consoleWin: BrowserWindow | null = null;
  private playerWin: BrowserWindow | null = null;

  constructor(private readonly hooks: WindowHooks) {}

  private static webPreferences(route: Route): Electron.WebPreferences {
    return {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Only the console hosts web tabs (ADR 0011); the player stays a pure view.
      webviewTag: route === 'console',
    };
  }

  /**
   * Web tabs (ADR 0011). Every guest page is an ordinary sandboxed web page in one persistent
   * session: no preload, no node, http(s) only, links that want a new window go to the system
   * browser, and modifier combos pressed inside a page are echoed to the console so hotkeys
   * keep working while a document has focus.
   */
  private static hostWebTabs(win: BrowserWindow): void {
    const web = session.fromPartition(WEB_TAB_PARTITION);
    web.setUserAgent(webTabUserAgent(process.platform));
    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      const src = typeof params['src'] === 'string' ? params['src'] : '';
      if (params['partition'] !== WEB_TAB_PARTITION || !isWebUrl(src)) event.preventDefault();
    });
    win.webContents.on('did-attach-webview', (_event, guest) => {
      WindowManager.guardGuest(win, guest);
    });
  }

  /** The same rules for a web tab's page and for any pop-up window it opens. */
  private static guardGuest(win: BrowserWindow, guest: Electron.WebContents): void {
    guest.setWindowOpenHandler(({ url, disposition }) => {
      const plan = planWindowOpen(url, disposition);
      if (plan === 'popup') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: win,
            width: 560,
            height: 720,
            autoHideMenuBar: true,
            backgroundColor: '#14181d',
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
          },
        };
      }
      if (plan === 'external') void shell.openExternal(url);
      return { action: 'deny' };
    });
    guest.on('did-create-window', (child) => WindowManager.guardGuest(win, child.webContents));
    guest.on('will-navigate', (event, url) => {
      if (!isWebUrl(url)) event.preventDefault();
    });
    guest.on('before-input-event', (_e, input) => {
      const echo = forwardableInput(input);
      if (echo && !win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.webTabInput, echo);
    });
  }

  private static titleBarOptions(): Electron.BrowserWindowConstructorOptions {
    if (process.platform === 'darwin') {
      return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 9 } };
    }
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#11151a', symbolColor: '#9aa3ad', height: 34 },
    };
  }

  private static load(win: BrowserWindow, route: Route): void {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      // Dev only: surface renderer errors in the terminal that runs `pnpm dev`.
      win.webContents.on('console-message', (event) => {
        if (event.level === 'error') console.error(`[renderer:${route}] ${event.message}`);
      });
      void win.loadURL(`${devUrl}#/${route}`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` });
    }
  }

  openConsole(saved: WindowBounds | null): BrowserWindow {
    if (this.consoleWin && !this.consoleWin.isDestroyed()) {
      this.consoleWin.focus();
      return this.consoleWin;
    }
    const bounds = saved && isOnScreen(saved) ? saved : null;
    const win = new BrowserWindow({
      width: bounds?.width ?? 1400,
      height: bounds?.height ?? 900,
      ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
      // One panel at its floor plus the icon dock (ADR 0014): half of a 1920 screen at 125 %.
      minWidth: 760,
      minHeight: 640,
      title: 'Trifold',
      backgroundColor: '#14181d',
      show: false,
      autoHideMenuBar: true,
      // The renderer draws the title bar (ADR 0004 §2.1). Windows draws the window controls
      // over its right end so snap layouts and double-click keep working; macOS draws the
      // traffic lights over its left end (ADR 0006). The renderer leaves both spaces free.
      ...WindowManager.titleBarOptions(),
      webPreferences: WindowManager.webPreferences('console'),
    });
    WindowManager.hostWebTabs(win);
    win.once('ready-to-show', () => {
      if (bounds?.maximized) win.maximize();
      win.show();
    });
    win.on('close', () => this.hooks.onConsoleClosing(boundsOf(win)));
    win.on('closed', () => {
      this.consoleWin = null;
      this.closePlayer();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    WindowManager.load(win, 'console');
    this.consoleWin = win;
    return win;
  }

  openPlayer(display: Display): void {
    if (this.playerWin && !this.playerWin.isDestroyed()) {
      this.playerWin.setBounds(display.bounds);
      this.playerWin.showInactive();
      return;
    }
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      // macOS `fullscreen` moves the window to its own Space with an animation and steals focus;
      // simpleFullscreen just covers the display, which is all the TV window needs.
      ...(process.platform === 'darwin' ? { simpleFullscreen: true } : { fullscreen: true }),
      show: false,
      title: 'Trifold player',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: WindowManager.webPreferences('player'),
    });
    win.once('ready-to-show', () => {
      win.showInactive();
      this.consoleWin?.focus();
      this.hooks.onPlayerChanged(true);
    });
    win.webContents.on('did-finish-load', () => this.hooks.onPlayerReady());
    win.on('closed', () => {
      this.playerWin = null;
      this.hooks.onPlayerChanged(false);
    });
    WindowManager.load(win, 'player');
    this.playerWin = win;
  }

  closePlayer(): void {
    const win = this.playerWin;
    this.playerWin = null;
    if (win && !win.isDestroyed()) win.close();
  }

  isPlayerOpen(): boolean {
    return this.playerWin !== null && !this.playerWin.isDestroyed();
  }

  sendToPlayer(channel: string, payload: unknown): void {
    const win = this.playerWin;
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  sendToConsole(channel: string, payload: unknown): void {
    const win = this.consoleWin;
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  focusConsole(): void {
    const win = this.consoleWin;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  }

  static listDisplays(): DisplayInfo[] {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label || `Display ${d.id}`,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === primaryId,
      isInternal: d.internal,
    }));
  }

  /** The saved display if still attached, else the first non-primary display, else the primary. */
  static pickDisplay(preferredId: number | null | undefined): Display {
    const all = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    if (preferredId !== null && preferredId !== undefined) {
      const match = all.find((d) => d.id === preferredId);
      if (match) return match;
    }
    return all.find((d) => d.id !== primary.id) ?? primary;
  }
}
