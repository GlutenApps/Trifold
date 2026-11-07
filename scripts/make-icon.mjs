// Renders the app icon from docs/design-brief/logo.svg: the mark on a dark rounded tile at
// 1024 × 1024, written to apps/desktop/build/icon.png. electron-builder derives icon.ico and
// icon.icns from that one file. Runs under Electron (Chromium does the SVG rasterising, so no
// native image dependency is added):
//   pnpm make:icon
import { app, BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 1024;
// The console's --bg and --border (renderer/styles/global.css); the mark is already the accent.
const TILE = '#14181d';
const EDGE = '#333d48';

const svg = readFileSync(join(root, 'docs/design-brief/logo.svg'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${SIZE}px; height: ${SIZE}px; background: transparent; overflow: hidden; }
  .tile { position: absolute; inset: 0; width: ${SIZE}px; height: ${SIZE}px; border-radius: ${SIZE * 0.22}px;
          background: ${TILE}; box-shadow: inset 0 0 0 ${SIZE * 0.012}px ${EDGE}; }
  .mark { position: absolute; left: ${SIZE * 0.17}px; top: ${SIZE * 0.17}px;
          width: ${SIZE * 0.66}px; height: ${SIZE * 0.66}px; display: grid; place-items: center; }
  .mark svg { width: 100%; height: 100%; }
</style></head><body><div class="tile"></div><div class="mark">${svg}</div></body></html>`;

// A software-rendered offscreen page in a throwaway profile: no GPU cache, no clash with a
// running Trifold, and a watchdog so a build can never hang here.
app.disableHardwareAcceleration();
app.setPath('userData', mkdtempSync(join(tmpdir(), 'trifold-icon-')));
const watchdog = setTimeout(() => {
  console.error('make-icon: timed out waiting for the page to paint');
  app.exit(1);
}, 20000);

function save(image) {
  const size = image.getSize();
  const out = join(root, 'apps/desktop/build');
  mkdirSync(out, { recursive: true });
  const png = image.toPNG();
  writeFileSync(join(out, 'icon.png'), png);
  console.log(
    `make-icon: wrote apps/desktop/build/icon.png (${size.width}×${size.height}, ${png.length} bytes)`,
  );
  clearTimeout(watchdog);
  app.exit(0);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  // Give layout and font work a moment, then take the frame.
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage();
  if (image.isEmpty()) {
    console.error('make-icon: capturePage returned an empty image');
    app.exit(1);
    return;
  }
  save(image.getSize().width === SIZE ? image : image.resize({ width: SIZE, height: SIZE }));
});
