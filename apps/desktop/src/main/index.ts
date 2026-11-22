import { app, net, screen } from 'electron';
import { join } from 'node:path';
import { EVENT_CHANNELS, featureFlags } from '@trifold/api';
import { TEXT_SIZE_ZOOM } from '@trifold/schema';
import { createApi } from './api';
import { AppConfigStore } from './appConfig';
import { configCopyTarget, copyStatus } from './backupCopy';
import { registerIpc } from './ipc';
import { LibrarySession } from './library/session';
import { createLogger, errorMessage } from './log';
import { IconResources } from './icons';
import { runDailyBackup, runQuitBackup } from './libraryOpen';
import { installMediaHandler, registerMediaScheme } from './media';
import { installApplicationMenu } from './menu';
import phoneAudioHelper from './phoneAudio/helper.ps1?raw';
import { PhoneAudioReceiver } from './phoneAudio/receiver';
import { PresenterHub } from './presenter';
import { SaveFlush } from './saveFlush';
import { createSplashWindow, Splash } from './splash';
import { TableHub } from './table/hub';
import { JoinedService } from './joined/service';
import { NsisSelfInstaller, selfUpdateBlocker } from './updateInstaller';
import { UpdateService, releaseFolder } from './updates';
import { UPDATE_PUBLIC_KEYS } from './updateSignature';
import { WindowManager } from './windows';

// Test hooks: the smoke test points both at temporary folders.
const userDataOverride = process.env['TRIFOLD_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

// Windows groups taskbar buttons by this ID and draws them with the icon of the Start-menu
// shortcut registered under it. Unpackaged runs (dev, smoke) get their own ID, so an installed
// Trifold's shortcut never lends them its icon or merges with their windows.
app.setAppUserModelId(app.isPackaged ? 'app.trifold.desktop' : 'app.trifold.desktop.dev');
registerMediaScheme();

// The loading splash (splash.ts): opens only if the console is not up within 250 ms.
const splash = new Splash(() => createSplashWindow(WindowManager.iconOptions()));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A failed startup still closes the splash, so no frameless window is left without a way out.
  main().catch((err: unknown) => {
    splash.done();
    throw err;
  });
}

async function main(): Promise<void> {
  await app.whenReady();
  if (process.env['TRIFOLD_NO_SPLASH'] !== '1') splash.start();
  installApplicationMenu();

  let session: LibrarySession | null = null;
  const logger = createLogger(() => session?.logDir ?? null, join(app.getPath('userData'), 'logs'));
  const config = await AppConfigStore.load(join(app.getPath('userData'), 'config.json'), logger);
  // Bundled SRD content lives in resources/ (repo root in dev, extraResources when packaged).
  const bundledDir = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), '..', '..', 'resources');
  session = new LibrarySession(logger, bundledDir, {
    appVersion: app.getVersion(),
    copy: configCopyTarget(config, logger, () =>
      windows.sendToConsole(EVENT_CHANNELS.backupCopy, copyStatus(config, activeSession)),
    ),
  });
  const activeSession = session;
  const icons = new IconResources(join(bundledDir, 'icons'), logger, () => session?.logDir ?? null);
  installMediaHandler(activeSession, icons);

  // Closing the console (ADR 0015): flush the renderer's pending saves, hide, write the on-close
  // backup, then let the close through. Every later close attempt is let through at once.
  const saves = new SaveFlush();
  let closing: 'open' | 'busy' | 'done' = 'open';
  const finishBeforeClose = async () => {
    const flushed = await saves.request(
      () => windows.sendToConsole(EVENT_CHANNELS.flushSaves, {}),
      3000,
    );
    if (flushed === 'timeout') logger.warn('console did not confirm its last saves before close');
    windows.hideConsole();
    windows.closePlayer();
    await Promise.race([
      runQuitBackup({ session: activeSession, logger }),
      new Promise((done) => setTimeout(done, 60_000)),
    ]);
    // The window's bounds (saved as the close began) and any other settings write must land
    // before Trifold quits; a write cut off mid-way leaves a temp file beside config.json.
    await Promise.race([config.idle(), new Promise((done) => setTimeout(done, 5_000))]);
  };

  const windows = new WindowManager({
    onConsoleClosing: (bounds, event) => {
      if (closing === 'done') return;
      event.preventDefault();
      if (closing === 'busy') return;
      closing = 'busy';
      config.update({ consoleWindow: bounds }).catch((err: unknown) => {
        logger.warn(`could not save window bounds: ${errorMessage(err)}`);
      });
      void finishBeforeClose().finally(() => {
        closing = 'done';
        windows.closeConsole();
      });
    },
    onPlayerChanged: (open) => windows.sendToConsole(EVENT_CHANNELS.playerWindowChanged, { open }),
    onPlayerReady: () => presenter.sync(),
  });
  const presenter = new PresenterHub(windows);
  // A TV plugged in while the DM is live opens there (ADR 0046), as Go live would have done.
  screen.on('display-added', () => {
    if (!presenter.get().live || windows.isPlayerOpen()) return;
    const display = WindowManager.liveDisplay(session?.store?.getSettings().playerDisplayId);
    if (display) windows.openPlayer(display);
  });

  const libraryPath =
    process.env['TRIFOLD_LIBRARY'] ??
    config.get().libraryPath ??
    join(app.getPath('documents'), 'Trifold Library');
  splash.setStatus('Opening your Library…');
  const info = await activeSession.open(libraryPath);
  if (info.ok && config.get().libraryPath !== info.path) {
    await config.update({ libraryPath: info.path });
  }
  // The window controls start in the Library's theme (the console opens below).
  if (activeSession.store) windows.setTheme(activeSession.store.getSettings().theme);
  // Daily rolling backup: at start and once an hour while the app is open.
  void runDailyBackup({ session: activeSession, logger });
  setInterval(() => void runDailyBackup({ session: activeSession, logger }), 60 * 60 * 1000);

  // Phone audio receiver (ADR 0007, Windows): a hidden PowerShell helper holds the connection.
  const phoneAudio = new PhoneAudioReceiver(phoneAudioHelper, logger, (status) =>
    windows.sendToConsole(EVENT_CHANNELS.phoneAudioStatus, {
      ...status,
      remembered: config.get().phoneAudioDevices,
      source: config.get().audioSource,
    }),
  );

  // The update check (ADR 0034): off until the DM turns it on; then at launch and daily. The
  // installed Windows build also downloads and installs signed updates (ADR 0045); every other
  // build opens the release page.
  const selfUpdateOff = selfUpdateBlocker({
    platform: process.platform,
    packaged: app.isPackaged,
    windowsStore: process.windowsStore === true,
    portable: Boolean(process.env['PORTABLE_EXECUTABLE_DIR']),
    keys: UPDATE_PUBLIC_KEYS,
  });
  if (selfUpdateOff) logger.info(`in-app updates are off (${selfUpdateOff})`);
  const updates = new UpdateService(
    config,
    logger,
    app.getVersion(),
    (status) => windows.sendToConsole(EVENT_CHANNELS.updateStatus, status),
    net.fetch,
    undefined,
    selfUpdateOff ? null : new NsisSelfInstaller(logger, releaseFolder),
  );
  updates.start();

  // Restart to update, only ever on the DM's click: the same close flow as closing the console
  // (flush saves, on-close backup), then the installer, which relaunches Trifold when done.
  const restartToUpdate = async (): Promise<boolean> => {
    if (closing !== 'open' || !updates.readyToInstall()) return false;
    closing = 'busy';
    const bounds = windows.consoleBounds();
    if (bounds) await config.update({ consoleWindow: bounds }).catch(() => undefined);
    await finishBeforeClose();
    closing = 'done';
    if (updates.install()) {
      app.quit();
      return true;
    }
    // The installer did not start: carry on as if nothing happened.
    closing = 'open';
    windows.showConsole();
    return false;
  };

  // The table server (ADR 0043): off until the DM starts it from the VTT tab.
  const smokePort = Number(process.env['TRIFOLD_TABLE_PORT']);
  const table = new TableHub({
    config,
    session: activeSession,
    logger,
    icons,
    webDir: join(app.getAppPath(), 'out', 'web'),
    onStatus: (status) => windows.sendToConsole(EVENT_CHANNELS.tableStatus, status),
    onIntent: (intent) => windows.sendToConsole(EVENT_CHANNELS.tableIntent, intent),
    onToken: (event) => windows.sendToConsole(EVENT_CHANNELS.tableToken, event),
    onSummon: (event) => windows.sendToConsole(EVENT_CHANNELS.tableSummon, event),
    ...(smokePort ? { ports: [smokePort] } : {}),
  });

  // Joined campaigns (docs/PLAYER-MODE.md): nothing searches or connects until the player asks,
  // and not at all while player mode is switched off.
  const joined = new JoinedService({
    session: activeSession,
    logger,
    enabled: featureFlags(process.env).playerMode,
    onTables: (tables) => windows.sendToConsole(EVENT_CHANNELS.joinedTables, tables),
  });

  registerIpc(
    createApi({
      config,
      session: activeSession,
      windows,
      presenter,
      table,
      joined,
      logger,
      icons,
      phoneAudio,
      saves,
      updates,
      restartToUpdate,
    }),
    logger,
  );
  splash.setStatus('Loading the console…');
  windows.setConsoleZoom(TEXT_SIZE_ZOOM[config.get().textSize]);
  windows.openConsole(config.get().consoleWindow).once('ready-to-show', () => splash.done());

  app.on('second-instance', () => windows.focusConsole());
  // The console window is the app on every platform (ADR 0006): closing it quits, so the
  // player window and audio never outlive it, on macOS too.
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    // Quit from the menu or Cmd+Q: run the console's close flow first (flush, on-close backup);
    // it closes the last window, which quits again with the Library still open until here.
    if (closing !== 'done' && windows.isConsoleOpen()) {
      event.preventDefault();
      windows.closeConsole();
      return;
    }
    phoneAudio.disconnect();
    void table.stop();
    joined.stop();
    updates.stop();
    activeSession.close();
  });
}
