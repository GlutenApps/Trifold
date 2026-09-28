import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const RENAME_ATTEMPTS = 6;
const RENAME_BACKOFF_MS = 50;

function isTransient(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** In-process serialization per target path: two writers never race on the same file. */
const locks = new Map<string, Promise<void>>();

async function withPathLock<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => {
    release = r;
  });
  locks.set(
    path,
    previous.then(() => current),
  );
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (locks.get(path) === current) locks.delete(path);
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      if (attempt >= RENAME_ATTEMPTS || !isTransient(err)) throw err;
      await sleep(RENAME_BACKOFF_MS * attempt);
    }
  }
}

/**
 * Write temp file → fsync → rename over the target (CLAUDE.md ground rule 2).
 * The target is either untouched or fully written; a crash mid-write leaves only a `.tmp` file.
 * Writes to the same path are serialized in-process, and the rename retries briefly because sync
 * clients (OneDrive) and antivirus can hold a freshly written file open for a moment on Windows.
 */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const target = resolve(path);
  await withPathLock(target, async () => {
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      const handle = await open(tmp, 'w');
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await renameWithRetry(tmp, target);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
  });
}

/** UTF-8, 2-space indent, trailing newline (DATA-FORMATS.md §5). */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}
