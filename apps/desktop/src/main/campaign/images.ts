import { copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { nativeImage } from 'electron';
import { ulid } from 'ulid';
import type { SceneImage } from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';

/** Long edge of the copy the player window shows (DESIGN.md §6.5). */
export const DISPLAY_LONG_EDGE = 4096;
const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/**
 * Copies an image into `campaigns/<slug>/images/` (so campaigns stay portable) and writes a
 * display-size JPEG beside it. Uses Electron's nativeImage: no native image dependency.
 */
export async function importSceneImage(
  store: LibraryStore,
  slug: string,
  sourcePath: string,
): Promise<SceneImage> {
  const ext = extname(sourcePath).toLowerCase();
  if (!ALLOWED.has(ext)) throw new Error('Supported images are PNG, JPG and WebP');
  const image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) throw new Error('That file could not be read as an image');
  const { width, height } = image.getSize();

  const id = ulid();
  const dir = store.resolvePath(`campaigns/${slug}/images`);
  await mkdir(dir, { recursive: true });
  const originalName = `${id}${ext === '.jpeg' ? '.jpg' : ext}`;
  const displayName = `${id}.display.jpg`;

  const tmpOriginal = join(dir, `${originalName}.tmp`);
  await copyFile(sourcePath, tmpOriginal);
  await rename(tmpOriginal, join(dir, originalName));

  const scale = Math.min(1, DISPLAY_LONG_EDGE / Math.max(width, height));
  const display =
    scale < 1
      ? image.resize({
          width: Math.round(width * scale),
          height: Math.round(height * scale),
          quality: 'best',
        })
      : image;
  const tmpDisplay = join(dir, `${displayName}.tmp`);
  try {
    await writeFile(tmpDisplay, display.toJPEG(88));
    await rename(tmpDisplay, join(dir, displayName));
  } catch (err) {
    await unlink(tmpDisplay).catch(() => undefined);
    throw err;
  }
  return { path: `images/${originalName}`, displayPath: `images/${displayName}`, width, height };
}
