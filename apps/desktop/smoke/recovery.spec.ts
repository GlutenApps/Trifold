import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { keepLogs } from './keepLogs';
import { chooseGameMaster } from './firstRun';

/**
 * Startup and console recovery (ADR 0079) inside real Electron: a console that was hidden is
 * brought back by opening Trifold again; a console page that stops is reloaded once, and one
 * that stops again straight away is replaced by a page that says so, with each step in the log.
 */

const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;
const exe = process.env['TRIFOLD_SMOKE_EXE'];
const appDir = resolve(__dirname, '..');

function launchEnv(userData: string, library: string): Record<string, string> {
  const base = Object.fromEntries(
    Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined),
  );
  return { ...base, TRIFOLD_USER_DATA: userData, TRIFOLD_NO_SPLASH: '1', TRIFOLD_LIBRARY: library };
}

/** The console window as main sees it. */
function consoleState(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.getTitle().startsWith('Trifold'));
    return win
      ? {
          visible: win.isVisible(),
          crashed: win.webContents.isCrashed(),
          url: win.webContents.getURL(),
        }
      : null;
  });
}

/** Whether the console's reloaded page is up and has drawn the Library. */
function consoleDrawn(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(async ({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]?.webContents;
    if (!wc || wc.isCrashed() || wc.isLoading()) return false;
    return wc
      .executeJavaScript(`!!document.querySelector('[data-testid="library"]')`)
      .catch(() => false) as Promise<boolean>;
  });
}

function crashConsole(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
  });
}

async function libraryLog(library: string): Promise<string> {
  const dir = join(library, 'logs');
  const files = await readdir(dir).catch(() => [] as string[]);
  const texts = await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')));
  return texts.join('\n');
}

test('a hidden console comes back on a second launch, and a stopped console page recovers or explains', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'trifold-userdata-'));
  const library = await mkdtemp(join(tmpdir(), 'trifold-library-'));
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [appDir] }),
    env: launchEnv(userData, library),
  });

  try {
    const page = await app.firstWindow();
    await chooseGameMaster(page);
    // Every launch starts on Library › Campaigns (ADR 0079).
    await expect(page.getByRole('button', { name: 'Create campaign' })).toBeVisible();

    // A console that is not on screen (as when its page never painted) is shown again when
    // Trifold is opened a second time: the second copy hands over and quits.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());
    expect((await consoleState(app))?.visible).toBe(false);
    const second = spawn(
      exe ?? (createRequire(__filename)('electron') as unknown as string),
      exe ? [] : [appDir],
      { env: launchEnv(userData, library), stdio: 'ignore' },
    );
    const secondExit = await new Promise<number | null>((done) => second.on('exit', done));
    expect(secondExit).toBe(0);
    await expect.poll(async () => (await consoleState(app))?.visible).toBe(true);

    // The page stops: main reloads it once and the console comes back.
    await crashConsole(app);
    // The reason is the OS's: a forced crash reads "crashed" on Windows and "killed" on macOS.
    await expect.poll(() => libraryLog(library)).toContain('console page stopped (');
    await expect.poll(() => consoleDrawn(app), { timeout: 20_000 }).toBe(true);

    // It stops again within the minute: no second reload, the window says what happened.
    await crashConsole(app);
    await expect
      .poll(async () => (await consoleState(app))?.url, { timeout: 20_000 })
      .toMatch(/^data:text\/html/);
    expect((await consoleState(app))?.visible).toBe(true);
  } catch (err) {
    await keepLogs({ library, userData });
    throw err;
  } finally {
    await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
  }
});
