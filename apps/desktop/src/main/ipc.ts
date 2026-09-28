import { ipcMain } from 'electron';
import { API_METHODS, channelName, type ApiNamespace, type TrifoldApi } from '@trifold/api';
import { errorMessage, type Logger } from './log';

type AnyMethod = (...args: unknown[]) => Promise<unknown>;

/**
 * One `ipcMain.handle` per method in `API_METHODS`. Failures are logged (CLAUDE.md: never a silent
 * no-op) and rethrown so the renderer can show them.
 */
export function registerIpc(api: TrifoldApi, logger: Logger): void {
  for (const ns of Object.keys(API_METHODS) as ApiNamespace[]) {
    const namespace = api[ns] as unknown as Record<string, AnyMethod | undefined>;
    for (const method of API_METHODS[ns]) {
      const impl = namespace[method];
      if (typeof impl !== 'function') {
        throw new Error(`API method ${ns}.${method} is not implemented`);
      }
      ipcMain.handle(channelName(ns, method), async (_event, ...args: unknown[]) => {
        try {
          return await impl.apply(namespace, args);
        } catch (err) {
          logger.error(`${ns}.${method} failed: ${errorMessage(err)}`);
          throw err;
        }
      });
    }
  }
}
