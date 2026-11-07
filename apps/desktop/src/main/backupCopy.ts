import type { BackupCopyStatus } from '@trifold/api';
import type { AppConfigStore } from './appConfig';
import type { BackupCopyTarget } from './backups';
import type { LibrarySession } from './library/session';
import { errorMessage, type Logger } from './log';

/**
 * Glue between `BackupService` and the app config for the second backup location (ADR 0015).
 * The chosen folder and the last copy's outcome live in `<userData>/config.json`, not in the
 * Library, because a drive letter or a sync folder only means something on this computer.
 */
/** The second backup location as the Backups card shows it (ADR 0015). */
export function copyStatus(config: AppConfigStore, session: LibrarySession): BackupCopyStatus {
  const { folder, lastCopyAt, lastError } = config.get().backupCopy;
  return {
    folder,
    target: folder ? (session.backups?.copyTarget(folder) ?? null) : null,
    lastCopyAt,
    lastError,
  };
}

/**
 * Where `BackupService` copies each zip: the folder saved in `config.json`. Each outcome is saved
 * there too and pushed to the console through `notify`.
 */
export function configCopyTarget(
  config: AppConfigStore,
  logger: Logger,
  notify: () => void,
): BackupCopyTarget {
  return {
    folder: () => config.get().backupCopy.folder,
    report(result) {
      const current = config.get().backupCopy;
      const next = result.ok
        ? { ...current, lastCopyAt: result.at, lastError: null }
        : { ...current, lastError: result.error };
      config
        .update({ backupCopy: next })
        .then(notify)
        .catch((err: unknown) =>
          logger.warn(`could not save backup copy status: ${errorMessage(err)}`),
        );
    },
  };
}
