import { readFile } from 'node:fs/promises';
import { APP_CONFIG_SCHEMA_VERSION, AppConfig, defaultAppConfig, migrate } from '@trifold/schema';
import { writeJsonAtomic } from './library/atomicWrite';
import { errorMessage, type Logger } from './log';

/**
 * `<userData>/config.json`: app-level state that belongs to this computer, not to any Library.
 * Which Library is open and which were opened recently, where the console window was, the
 * audio source and remembered phones (ADR 0007), and the second backup location (ADR 0015).
 * `update` is a shallow merge.
 */
export class AppConfigStore {
  private constructor(
    private readonly file: string,
    private config: AppConfig,
  ) {}

  static async load(file: string, logger: Logger): Promise<AppConfigStore> {
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

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const next = AppConfig.parse({
      ...this.config,
      ...patch,
      schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    });
    await writeJsonAtomic(this.file, next);
    this.config = next;
    return next;
  }
}
