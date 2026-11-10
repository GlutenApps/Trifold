import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type yazl from 'yazl';

/**
 * Adds a file that is opened only when its turn comes and whose bytes are counted as they are
 * read. yazl's `addFile` sizes the file up front and fails when a save lands before the read;
 * Library writes are atomic renames, so a file read late is still one complete version.
 */
export function addFileLazily(zip: yazl.ZipFile, path: string, name: string): void {
  zip.addReadStreamLazy(name, (done) => {
    const stream = createReadStream(path);
    stream.on('error', (err) => zip.emit('error', err));
    done(null, stream);
  });
}

/**
 * Writes an ended zip to `partial`. yazl reports a bad entry as an 'error' event on the zip, not on
 * its output stream; unheard, that event is an uncaught exception, which in the main process is a
 * modal error box. Here it rejects instead, and the partial file is removed.
 */
export async function writeZipTo(zip: yazl.ZipFile, partial: string): Promise<void> {
  const failed = new Promise<never>((_, reject) => zip.on('error', reject));
  failed.catch(() => undefined);
  const out = createWriteStream(partial);
  try {
    await Promise.race([pipeline(zip.outputStream, out), failed]);
  } catch (err) {
    zip.outputStream.unpipe(out);
    out.destroy();
    await rm(partial, { force: true });
    throw err;
  }
}
