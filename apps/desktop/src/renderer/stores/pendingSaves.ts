/**
 * Every autosave that waits for typing or dragging to settle goes through here, so the console
 * can write them all at once before a backup or when it closes (ADR 0015).
 *
 * `key` names one save slot (a store's name, or a component's ref): scheduling again replaces
 * the waiting save. A save's function may return its write's promise; `flushPendingSaves` waits
 * for those.
 */
type Run = () => unknown;

const pending = new Map<unknown, { timer: number; run: Run }>();

export function scheduleSave(key: unknown, run: Run, delayMs: number): void {
  cancelSave(key);
  const timer = window.setTimeout(() => {
    pending.delete(key);
    void run();
  }, delayMs);
  pending.set(key, { timer, run });
}

/** Drops a waiting save without running it. */
export function cancelSave(key: unknown): void {
  const entry = pending.get(key);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  pending.delete(key);
}

export function hasPendingSave(key: unknown): boolean {
  return pending.has(key);
}

/** Runs every waiting save now and resolves when their writes have finished (or failed). */
export async function flushPendingSaves(): Promise<void> {
  const runs = [...pending.values()];
  pending.clear();
  for (const { timer } of runs) window.clearTimeout(timer);
  await Promise.allSettled(runs.map(({ run }) => Promise.resolve().then(run)));
}

/** Runs one waiting save now, if there is one, and waits for its write. */
export async function flushSave(key: unknown): Promise<void> {
  const entry = pending.get(key);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  pending.delete(key);
  await Promise.resolve().then(entry.run);
}

/** The builder's slot for one encounter: switching encounters leaves the last one's save to land. */
export function encounterSlot(encounterId: string): string {
  return `encounter:${encounterId}`;
}

/** The running fight's notes: `end()` writes them before the result, so none land after it. */
export const COMBAT_NOTES_SLOT = 'combat-notes';

/** Tests only: forgets every waiting save without running it. */
export function discardPendingSaves(): void {
  for (const { timer } of pending.values()) window.clearTimeout(timer);
  pending.clear();
}
