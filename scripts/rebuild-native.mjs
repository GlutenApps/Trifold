// Prepares the two binaries the app needs and pnpm cannot be trusted to build (ADR 0001):
//   1. Electron itself: its postinstall downloads dist/, but pnpm skips it whenever its build
//      bookkeeping believes the package is already installed.
//   2. better-sqlite3 for the pinned Electron ABI: electron-builder's install-app-deps cannot see
//      the module in pnpm's hoisted layout, so we resolve it ourselves and call prebuild-install.
// Runs as apps/desktop's postinstall and via `pnpm rebuild:native`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopPackage = join(here, '..', 'apps', 'desktop', 'package.json');
const require = createRequire(desktopPackage);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function run(label, args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env });
  if (result.status !== 0) {
    console.error(`rebuild-native: ${label} failed (exit ${result.status ?? 'signal'}).`);
    console.error('See docs/adr/0001-electron-and-native-module-pins.md before changing a pin.');
    process.exit(result.status ?? 1);
  }
}

// 1. Electron binary.
const electronDir = dirname(require.resolve('electron/package.json'));
const electronVersion = require('electron/package.json').version;
const pathFile = join(electronDir, 'path.txt');
const electronExe = existsSync(pathFile)
  ? join(electronDir, 'dist', readFileSync(pathFile, 'utf8').trim())
  : null;
if (!electronExe || !existsSync(electronExe)) {
  console.log(`rebuild-native: downloading Electron ${electronVersion}`);
  run('Electron download', [join(electronDir, 'install.js')], electronDir);
}

// 2. better-sqlite3 prebuild for Electron's ABI.
const moduleDir = dirname(require.resolve('better-sqlite3/package.json'));
const prebuildInstall = join(dirname(require.resolve('prebuild-install')), 'bin.js');
const arch = process.env.npm_config_arch || process.arch;
run(
  `better-sqlite3 prebuild for Electron ${electronVersion} (${arch})`,
  [
    prebuildInstall,
    '--runtime=electron',
    `--target=${electronVersion}`,
    `--arch=${arch}`,
    '--force',
  ],
  moduleDir,
);

console.log(`rebuild-native: Electron ${electronVersion} and better-sqlite3 (${arch}) ready`);
