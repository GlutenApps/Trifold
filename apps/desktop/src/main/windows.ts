import { BrowserWindow, screen, shell, type Display } from 'electron';
import { join } from 'node:path';
import type { DisplayInfo } from '@trifold/api';
import type { WindowBounds } from '@trifold/schema';

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

  private static webPreferences(): Electron.WebPreferences {
    return {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
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
      minWidth: 1000,
      minHeight: 640,
      title: 'Trifold',
      backgroundColor: '#14161a',
      show: false,
      autoHideMenuBar: true,
      webPreferences: WindowManager.webPreferences(),
    });
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
      fullscreen: true,
      show: false,
      title: 'Trifold player',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: WindowManager.webPreferences(),
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
