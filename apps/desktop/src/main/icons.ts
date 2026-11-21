import { appendFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IconCreditsInfo } from '@trifold/api';
import { IconCredits, IconTables } from '@trifold/schema';
import type { Logger } from './log';

/**
 * Main-process access to the bundled game-icons set (DESIGN.md §6.8): the mapping tables, which
 * glyphs exist, their SVG text for the media handler, and the credits for the About page.
 * `IconResources` below.
 */
const NAME = /^[a-z0-9-]+$/;

/** The glyph bundle in the icons folder: `{ "<name>": "<svg>" }`, written by fetch-game-icons. */
export const GLYPH_BUNDLE = 'glyphs.json';

/**
 * The bundled game-icons set (DESIGN.md §6.8): resources/icons/glyphs.json, every glyph's SVG by
 * name in one file, plus the mapping tables and credits. One file rather than four thousand keeps
 * installs and updates fast: Windows checks each file an installer deletes or writes.
 * Everything is read once and cached; a build without the fetched set is fine (tokens fall back
 * to initials). Unmatched creatures go to Library/logs/icon-misses.txt.
 */
export class IconResources {
  private tablesCache: IconTables | null = null;
  private glyphsCache: Map<string, string> | null = null;
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

  private glyphs(): Map<string, string> {
    if (!this.glyphsCache) {
      this.glyphsCache = new Map();
      try {
        const raw: unknown = JSON.parse(readFileSync(join(this.dir, GLYPH_BUNDLE), 'utf8'));
        if (raw && typeof raw === 'object') {
          for (const [name, svg] of Object.entries(raw)) {
            if (NAME.test(name) && typeof svg === 'string') this.glyphsCache.set(name, svg);
          }
        }
      } catch {
        // No bundle: handled below.
      }
      if (this.glyphsCache.size === 0) {
        this.logger.warn('no bundled icons found; tokens will show initials');
      }
    }
    return this.glyphsCache;
  }

  available(): Set<string> {
    this.availableCache ??= new Set(this.glyphs().keys());
    return this.availableCache;
  }

  /** A glyph's SVG text, by `name` or `name.svg`, or null for unknown or unsafe names. */
  svg(file: string): string | null {
    const name = file.endsWith('.svg') ? file.slice(0, -4) : file;
    if (!NAME.test(name)) return null;
    return this.glyphs().get(name) ?? null;
  }

  credits(): IconCreditsInfo | null {
    if (this.creditsCache === undefined) {
      try {
        const parsed = IconCredits.parse(
          JSON.parse(readFileSync(join(this.dir, 'credits.json'), 'utf8')),
        );
        this.creditsCache = { ...parsed, icons: this.glyphs().size };
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
