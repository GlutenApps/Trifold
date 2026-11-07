import { app } from 'electron';
import { join } from 'node:path';
import { EVENT_CHANNELS } from '@trifold/api';
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
import { WindowManager } from './windows';

// Test hooks: the smoke test points both at temporary folders.
const userDataOverride = process.env['TRIFOLD_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

app.setAppUserModelId('app.trifold.desktop');
registerMediaScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  await app.whenReady();
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

  const libraryPath =
    process.env['TRIFOLD_LIBRARY'] ??
    config.get().libraryPath ??
    join(app.getPath('documents'), 'Trifold Library');
  const info = await activeSession.open(libraryPath);
  if (info.ok && config.get().libraryPath !== info.path) {
    await config.update({ libraryPath: info.path });
  }
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

  registerIpc(
    createApi({
      config,
      session: activeSession,
      windows,
      presenter,
      logger,
      icons,
      phoneAudio,
      saves,
    }),
    logger,
  );
  windows.openConsole(config.get().consoleWindow);

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
    activeSession.close();
  });
}
