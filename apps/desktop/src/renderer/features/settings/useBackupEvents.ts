import { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { flushPendingSaves } from '../../stores/pendingSaves';

/**
 * The console's side of backups (ADR 0015): write pending saves when main asks before closing,
 * and say once per session when a copy to the second location fails. The Backups card keeps
 * showing the failure until a copy succeeds.
 */
export function useBackupEvents(): void {
  useEffect(() => {
    let warned = false;
    const offFlush = window.trifold.on('flushSaves', () => {
      void flushPendingSaves().finally(() => void window.trifold.app.savesFlushed());
    });
    const offCopy = window.trifold.on('backupCopy', (status) => {
      if (!status.lastError || warned) return;
      warned = true;
      useAppStore.setState({
        error: `A backup could not be copied to ${status.folder ?? 'the second location'}: ${status.lastError}. It is still in the Library's backups folder.`,
      });
    });
    return () => {
      offFlush();
      offCopy();
    };
  }, []);
}
