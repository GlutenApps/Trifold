import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IconCreditsInfo } from '@trifold/api';
import { IconCredits, IconTables } from '@trifold/schema';
import type { Logger } from './log';

const NAME = /^[a-z0-9-]+$/;

/**
 * The bundled game-icons set (DESIGN.md §6.8): resources/icons/svg/<name>.svg plus the mapping
 * tables and credits. Everything is read once and cached; a build without the fetched set is
 * fine (tokens fall back to initials). Unmatched creatures go to Library/logs/icon-misses.txt.
 */
export class IconResources {
  private tablesCache: IconTables | null = null;
  private availableCache: Set<string> | null = null;
  private creditsCache: IconCreditsInfo | null | undefined;
  private readonly reported = new Set<string>();

  constructor(
    private readonly dir: string,
    private readonly logger: Logger,
    private readonly logDir: () => string | null,
  ) {}

  tables(): IconTables {
    if (!this.tablesCache) {
      const file = join(this.dir, 'mapping.json');
      try {
        this.tablesCache = IconTables.parse(JSON.parse(readFileSync(file, 'utf8')));
      } catch (err) {
        this.logger.warn(`icon mapping tables unavailable: ${String(err)}`);
        this.tablesCache = IconTables.parse({});
      }
    }
    return this.tablesCache;
  }

  available(): Set<string> {
    if (!this.availableCache) {
      const svgDir = join(this.dir, 'svg');
      this.availableCache = new Set(
        existsSync(svgDir)
          ? readdirSync(svgDir)
              .filter((f) => f.endsWith('.svg'))
              .map((f) => f.slice(0, -4))
          : [],
      );
      if (this.availableCache.size === 0) {
        this.logger.warn('no bundled icons found; tokens will show initials');
      }
    }
    return this.availableCache;
  }

  /** Absolute path of a glyph's SVG, or null for unknown or unsafe names. */
  svgPath(file: string): string | null {
    const name = file.endsWith('.svg') ? file.slice(0, -4) : file;
    if (!NAME.test(name) || !this.available().has(name)) return null;
    return join(this.dir, 'svg', `${name}.svg`);
  }

  credits(): IconCreditsInfo | null {
    if (this.creditsCache === undefined) {
      try {
        const parsed = IconCredits.parse(
          JSON.parse(readFileSync(join(this.dir, 'credits.json'), 'utf8')),
        );
        this.creditsCache = { ...parsed, icons: this.available().size };
      } catch {
        this.creditsCache = null;
      }
    }
    return this.creditsCache;
  }

  async reportMiss(kind: string, name: string): Promise<void> {
    const key = `${kind}\t${name}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    const dir = this.logDir();
    if (!dir) return;
    try {
      await mkdir(dir, { recursive: true });
      await appendFile(join(dir, 'icon-misses.txt'), `${key}\n`, 'utf8');
    } catch (err) {
      this.logger.warn(`could not record icon miss: ${String(err)}`);
    }
  }
}
