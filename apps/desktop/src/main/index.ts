import { app } from 'electron';
import { join } from 'node:path';
import { EVENT_CHANNELS } from '@trifold/api';
import { createApi } from './api';
import { AppConfigStore } from './appConfig';
import { registerIpc } from './ipc';
import { LibrarySession } from './library/session';
import { createLogger, errorMessage } from './log';
import { PresenterHub } from './presenter';
import { WindowManager } from './windows';

// Test hooks: the smoke test points both at temporary folders.
const userDataOverride = process.env['TRIFOLD_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

app.setAppUserModelId('app.trifold.desktop');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  await app.whenReady();

  let session: LibrarySession | null = null;
  const logger = createLogger(() => session?.logDir ?? null);
  session = new LibrarySession(logger);
  const activeSession = session;

  const config = await AppConfigStore.load(join(app.getPath('userData'), 'config.json'), logger);

  const windows = new WindowManager({
    onConsoleClosing: (bounds) => {
      config.update({ consoleWindow: bounds }).catch((err: unknown) => {
        logger.warn(`could not save window bounds: ${errorMessage(err)}`);
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

  registerIpc(createApi({ config, session: activeSession, windows, presenter, logger }), logger);
  windows.openConsole(config.get().consoleWindow);

  app.on('second-instance', () => windows.focusConsole());
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => activeSession.close());
}
