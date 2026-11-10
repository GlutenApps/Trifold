import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from '@playwright/test';

/**
 * Called when a smoke test fails, before the app is closed: copies the app's own logs (the
 * Library's `logs/` and userData's `logs/`) into the test's output folder, which CI uploads with
 * the trace. The temp folders are deleted afterwards, so without this a CI failure has no record
 * of what the main process was doing.
 */
export async function keepLogs(roots: Record<string, string>): Promise<void> {
  for (const [name, root] of Object.entries(roots)) {
    await cp(join(root, 'logs'), test.info().outputPath(`logs-${name}`), {
      recursive: true,
    }).catch(() => undefined);
  }
}
