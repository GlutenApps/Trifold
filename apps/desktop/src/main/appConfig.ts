import { readFile } from 'node:fs/promises';
import { APP_CONFIG_SCHEMA_VERSION, AppConfig, defaultAppConfig, migrate } from '@trifold/schema';
import { removeStaleTemps, writeJsonAtomic } from './library/atomicWrite';
import { errorMessage, type Logger } from './log';

/**
 * `<userData>/config.json`: app-level state that belongs to this computer, not to any Library.
 * Which Library is open and which were opened recently, where the console window was, the
 * audio source and remembered phones (ADR 0007), and the second backup location (ADR 0015).
 * `update` is a shallow merge. Updates run one at a time, each merging onto the result of the
 * one before, so two at once never drop each other's change; `idle` waits for the last write,
 * which the close flow does before Trifold quits.
 */
export class AppConfigStore {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly file: string,
    private config: AppConfig,
  ) {}

  static async load(file: string, logger: Logger): Promise<AppConfigStore> {
    // A write cut off by the process ending leaves a temp file beside config.json; clear old ones.
    const removed = await removeStaleTemps(file);
    if (removed > 0) logger.info(`removed ${removed} leftover config.json temp file(s)`);
    try {
      const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
      return new AppConfigStore(file, AppConfig.parse(migrate('appConfig', raw)));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'ENOENT') {
        logger.warn(`config.json unreadable, starting from defaults: ${errorMessage(err)}`);
      }
      return new AppConfigStore(file, defaultAppConfig());
    }
  }

  get(): AppConfig {
    return this.config;
  }

  update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const run = async (): Promise<AppConfig> => {
      const next = AppConfig.parse({
        ...this.config,
        ...patch,
        schemaVersion: APP_CONFIG_SCHEMA_VERSION,
      });
      await writeJsonAtomic(this.file, next);
      this.config = next;
      return next;
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Resolves once every update asked for so far has been written (or has failed). */
  async idle(): Promise<void> {
    await this.queue;
  }
}
