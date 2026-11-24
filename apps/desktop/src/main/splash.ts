/**
 * The loading splash (docs/brand/BRAND.md §3, `splash/splash-animated.html`): a small frameless
 * window with the turning mark, shown while the Library opens and the console loads. It opens
 * only when startup is slow, so a quick launch never flashes it, and closes the moment the
 * console is ready to show, or when startup fails. The page is self-contained (no fonts, images
 * or network) and loads from a data URL, so it needs nothing from the renderer build.
 *
 * `TRIFOLD_NO_SPLASH=1` turns it off: the smoke tests take the app's first window to be the
 * console.
 */
import { BrowserWindow } from 'electron';
import splashHtml from './splash.html?raw';
import { WINDOW_BG } from './windows';

/** How long startup may take before the splash appears (the kit's 250 ms). */
export const SPLASH_DELAY_MS = 250;

/** What the controller needs from the window, so the timing can be tested without Electron. */
export interface SplashWindow {
  show(): void;
  setStatus(text: string): void;
  close(): void;
}

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class Splash {
  private win: SplashWindow | null = null;
  private timer: unknown = null;
  private finished = false;
  private status = '';

  constructor(
    private readonly create: () => SplashWindow,
    private readonly delayMs = SPLASH_DELAY_MS,
    private readonly timers: Timers = realTimers,
  ) {}

  /** Starts the clock; the window is created only if `done` has not been called by then. */
  start(): void {
    if (this.finished || this.timer !== null || this.win) return;
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (this.finished) return;
      this.win = this.create();
      if (this.status) this.win.setStatus(this.status);
      this.win.show();
    }, this.delayMs);
  }

  /** A short line under the mark ("Opening your Library…"); remembered if the window is not up yet. */
  setStatus(text: string): void {
    this.status = text;
    this.win?.setStatus(text);
  }

  /** Startup is over, well or badly: cancel the clock and close the window. Safe to repeat. */
  done(): void {
    this.finished = true;
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
    this.win?.close();
    this.win = null;
  }
}

/**
 * The real window: frameless, centred, on the brand's slate, with the kit's animated page.
 * `onClosedByUser` runs when the DM closes it themselves (Alt+F4, the taskbar) rather than
 * startup closing it: they have given up waiting, so Trifold quits instead of running on with no
 * window (ADR 0079).
 */
export function createSplashWindow(
  extra: Electron.BrowserWindowConstructorOptions,
  onClosedByUser: () => void,
): SplashWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    title: 'Trifold',
    backgroundColor: WINDOW_BG,
    ...extra,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  let ready = false;
  let pending: string | null = null;
  let closedByStartup = false;
  win.once('closed', () => {
    if (!closedByStartup) onClosedByUser();
  });
  const push = (text: string) => {
    if (win.isDestroyed()) return;
    void win.webContents
      .executeJavaScript(`window.setSplashStatus(${JSON.stringify(text)})`)
      .catch(() => undefined);
  };
  win.webContents.once('did-finish-load', () => {
    ready = true;
    if (pending !== null) push(pending);
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  return {
    // The window's background is already the page's slate, so showing before the page has
    // painted shows the right colour rather than a white flash.
    show: () => {
      if (!win.isDestroyed()) win.show();
    },
    setStatus: (text) => {
      if (ready) push(text);
      else pending = text;
    },
    close: () => {
      closedByStartup = true;
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
