// Packs the brand kit's bare marks into apps/desktop/build/icon.ico: the shaded on-dark mark,
// transparent, filling the frame, with no tile behind it (the kit's own icon.ico sits the mark on a
// dark tile, which looked boxed-in and small beside other taskbar icons). Each frame is the kit's
// PNG rendered at that size, stored as-is (PNG frames, Windows Vista and later); 20 and 40 px are
// not in the kit, so Windows scales those from 24 and 48. Run `pnpm make:ico` after the kit changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const frames = SIZES.map((size) => {
  const png = readFileSync(join(root, `docs/brand/png/mark/mark-on-dark-${size}.png`));
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
    throw new Error(`mark-on-dark-${size}.png is not ${size}×${size}`);
  }
  return { size, png };
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(frames.length, 4);

let offset = 6 + 16 * frames.length;
const entries = frames.map(({ size, png }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  e.writeUInt8(size >= 256 ? 0 : size, 1); // height
  e.writeUInt8(0, 2); // palette colours
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});

const out = join(root, 'apps/desktop/build/icon.ico');
writeFileSync(out, Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]));
console.log(`wrote ${out} (${SIZES.join(', ')} px)`);
