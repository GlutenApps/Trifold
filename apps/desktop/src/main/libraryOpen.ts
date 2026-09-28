import type { LibraryInfo } from '@trifold/api';
import type { ApiContext } from './api';

const RECENT_LIBRARIES = 10;

/** Opens (or reopens) a Library, records it as the current and a recent one, and runs the daily backup if due. */
export async function reopenLibrary(
  ctx: Pick<ApiContext, 'session' | 'config' | 'logger'>,
  path: string,
): Promise<LibraryInfo> {
  const info = await ctx.session.open(path);
  if (info.ok) {
    const recent = [
      info.path,
      ...ctx.config.get().recentLibraries.filter((p) => p !== info.path),
    ].slice(0, RECENT_LIBRARIES);
    await ctx.config.update({ libraryPath: info.path, recentLibraries: recent });
    void runDailyBackup(ctx);
  }
  return info;
}

/** The daily rolling backup (DESIGN.md §4.2); called at open and on a timer. Never throws. */
export async function runDailyBackup(ctx: Pick<ApiContext, 'session' | 'logger'>): Promise<void> {
  const { backups, store } = ctx.session;
  if (!backups || !store) return;
  const settings = store.getSettings().backups;
  if (!settings.enabled) return;
  try {
    await backups.runDailyIfDue(settings.keepDays);
  } catch (err) {
    ctx.logger.error(`daily backup failed: ${String(err)}`);
  }
}
