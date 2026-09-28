import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Writes to the process console and, when a Library is open, appends to
 * `Library/logs/trifold-YYYY-MM-DD.log` (CLAUDE.md: main-process failures are logged to Library/logs/).
 */
export function createLogger(getLogDir: () => string | null): Logger {
  let queue: Promise<void> = Promise.resolve();

  const log = (level: LogLevel, message: string): void => {
    const now = new Date();
    const line = `${now.toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
    if (level === 'error') console.error(line);
    else console.log(line);

    const dir = getLogDir();
    if (!dir) return;
    const file = join(dir, `trifold-${now.toISOString().slice(0, 10)}.log`);
    queue = queue
      .then(() => mkdir(dir, { recursive: true }))
      .then(() => appendFile(file, `${line}\n`, 'utf8'))
      .catch(() => undefined);
  };

  return {
    log,
    info: (message) => log('info', message),
    warn: (message) => log('warn', message),
    error: (message) => log('error', message),
  };
}
