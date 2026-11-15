import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { dialog, nativeImage } from 'electron';
import { ulid } from 'ulid';
import type { ArtFolderFile, CreatureArt, TrifoldApi } from '@trifold/api';
import { RecordKind } from '@trifold/schema';
import type { LibrarySession } from './library/session';

/**
 * Creature art (DESIGN.md §6.8, ADR 0033). Every picture is fitted to 512 × 512 on the way in and
 * kept as PNG (transparency survives); the original is not kept, so backups stay small. A
 * compendium creature's art is Library-wide, `art/<kind>/<key>.png`, shared by every source and
 * edition of that creature; one token's art and a PC's or NPC's portrait live in their campaign's
 * `tokens/`. Every write goes through the LibraryStore.
 */
export const ART_EDGE = 512;
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const IMAGE = new Set(IMAGE_EXTENSIONS.map((e) => `.${e}`));
/** Keys are normalised names (lowercase words); nothing else reaches a file name. */
const KEY = /^[a-z0-9][a-z0-9 '-]*$/;

/** The picture as Trifold keeps it: fitted inside 512 × 512, PNG. */
export function fitArt(file: string): Buffer {
  if (!IMAGE.has(extname(file).toLowerCase())) {
    throw new Error('Supported images are PNG, JPG and WebP');
  }
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new Error('That file could not be read as an image');
  const { width, height } = image.getSize();
  const scale = Math.min(1, ART_EDGE / Math.max(width, height));
  const fitted =
    scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'best',
        })
      : image;
  return fitted.toPNG();
}

export const creatureArtPath = (kind: RecordKind, key: string) => `art/${kind}/${key}.png`;

async function chooseImage(title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

/** Every image under a folder, a few levels down, for Add from folder. */
async function imagesIn(dir: string, depth = 3): Promise<ArtFolderFile[]> {
  const out: ArtFolderFile[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth > 0) out.push(...(await imagesIn(path, depth - 1)));
    } else if (IMAGE.has(extname(entry.name).toLowerCase())) {
      out.push({ path, name: basename(entry.name, extname(entry.name)) });
    }
  }
  return out;
}

export function createArtApi(session: LibrarySession): Pick<TrifoldApi, 'art'> {
  const store = () => session.require().store;
  const campaigns = () => {
    const repo = session.campaigns;
    if (!repo) throw new Error('No Library is open');
    return repo;
  };
  const checkKey = (kind: RecordKind, key: string) => {
    RecordKind.parse(kind);
    if (!KEY.test(key)) throw new Error(`Not a creature key: ${key}`);
  };
  const entry = async (kind: RecordKind, key: string): Promise<CreatureArt | null> => {
    const path = creatureArtPath(kind, key);
    try {
      const info = await stat(store().resolvePath(path));
      return { kind, key, path, version: Math.round(info.mtimeMs) };
    } catch {
      return null;
    }
  };

  return {
    art: {
      async list() {
        const out: CreatureArt[] = [];
        for (const kind of RecordKind.options) {
          let files: string[];
          try {
            files = await readdir(store().resolvePath(`art/${kind}`));
          } catch {
            continue;
          }
          for (const file of files) {
            if (!file.endsWith('.png')) continue;
            const found = await entry(kind, file.slice(0, -'.png'.length));
            if (found) out.push(found);
          }
        }
        return out;
      },

      async chooseImage() {
        return chooseImage('Choose art');
      },

      async setCreature(kind, key, file) {
        checkKey(kind, key);
        const source = file ?? (await chooseImage('Choose art for this creature'));
        if (!source) return null;
        await store().writeBytes(creatureArtPath(kind, key), fitArt(source));
        return entry(kind, key);
      },

      async removeCreature(kind, key) {
        checkKey(kind, key);
        await store().removeFile(creatureArtPath(kind, key));
      },

      async setToken(file) {
        const slug = campaigns().current;
        if (!slug) throw new Error('Open a campaign first');
        const source = file ?? (await chooseImage('Choose art for this token'));
        if (!source) return null;
        const path = `tokens/${ulid()}.png`;
        await store().writeBytes(`campaigns/${slug}/${path}`, fitArt(source));
        return path;
      },

      async setCharacter(campaignId, kind, id, file) {
        const source = file ?? (await chooseImage('Choose a portrait'));
        if (!source) return null;
        const path = `tokens/${ulid()}.png`;
        await store().writeBytes(await campaigns().campaignDir(campaignId, path), fitArt(source));
        await campaigns().setPortrait(campaignId, kind, id, path);
        return path;
      },

      async removeCharacter(campaignId, kind, id) {
        await campaigns().setPortrait(campaignId, kind, id, null);
      },

      async chooseFolder() {
        const result = await dialog.showOpenDialog({
          title: 'Choose a folder of creature art',
          properties: ['openDirectory'],
        });
        const dir = result.canceled ? null : (result.filePaths[0] ?? null);
        return dir ? imagesIn(dir) : null;
      },
    },
  };
}
