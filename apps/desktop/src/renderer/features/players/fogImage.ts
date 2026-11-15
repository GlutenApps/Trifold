import type { FogShapeLike } from '@trifold/rules';

/**
 * The map image phones receive (decision 11, ADR 0043): the scene's display image with every
 * fogged area filled solid black, so a phone never holds the original map. A canvas, no new
 * packages; the console draws it once per fog change and main caches it in memory.
 */

/** The longest side of the JPEG; the phone scales it back to the map's size. */
const MAX_SIDE = 4096;

/** Paints the fog as black on a transparent layer: the fog starts whole, shapes apply in order. */
export function paintFog(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shapes: readonly FogShapeLike[],
): void {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillRect(0, 0, width, height);
  for (const s of shapes) {
    ctx.globalCompositeOperation = s.mode === 'reveal' ? 'destination-out' : 'source-over';
    ctx.beginPath();
    if (s.kind === 'all') ctx.rect(0, 0, width, height);
    else if (s.kind === 'rect') ctx.rect(s.x, s.y, s.w, s.h);
    else {
      for (let i = 0; i < s.points.length; i += 2) {
        if (i === 0) ctx.moveTo(s.points[i]!, s.points[i + 1]!);
        else ctx.lineTo(s.points[i]!, s.points[i + 1]!);
      }
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('could not encode the map'));
        void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
      },
      'image/jpeg',
      0.85,
    );
  });
}

/**
 * Draws `imageUrl` at the map's size (in map pixels, scaled down to fit `MAX_SIDE`), fills the
 * fog black when there is any, and encodes it as a JPEG.
 */
export async function fogMapJpeg(
  imageUrl: string,
  mapWidth: number,
  mapHeight: number,
  fog: readonly FogShapeLike[] | null,
): Promise<Uint8Array> {
  const img = await loadImage(imageUrl);
  const k = Math.min(1, MAX_SIDE / Math.max(mapWidth, mapHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(mapWidth * k));
  canvas.height = Math.max(1, Math.round(mapHeight * k));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (fog) {
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lctx = layer.getContext('2d')!;
    lctx.scale(k, k);
    paintFog(lctx, mapWidth, mapHeight, fog);
    ctx.drawImage(layer, 0, 0);
  }
  return toJpeg(canvas);
}
