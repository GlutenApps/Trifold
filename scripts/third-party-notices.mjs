// Build step (ADR 0056): writes apps/desktop/out/THIRD_PARTY_NOTICES.txt, the licence texts of
// every library Trifold ships. Two sources:
//   1. out/.licenses/*.json: the packages each bundle (main, preload, renderer, phone client)
//      contains, recorded by apps/desktop/licenseCollector.ts during the build;
//   2. the app's runtime `dependencies` and everything they depend on, which electron-builder
//      ships unbundled (better-sqlite3, electron-updater, ws and so on).
// The project's own packages (@trifold/*) are skipped. Runs after `electron-vite build` and
// `vite build`, before electron-builder, which copies the file into resources/licenses/.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps', 'desktop');
const out = join(app, 'out');

// LICENSE, LICENSE.md, LICENCE.txt, LICENSE-MIT, LICENSE.APACHE2, COPYING, NOTICE…
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-][\w.-]+)?$/i;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** A package folder for `name` as seen from `fromDir`, following node's lookup; null if none. */
function resolvePackage(name, fromDir) {
  try {
    const req = createRequire(join(fromDir, 'noop.js'));
    return dirname(realpathSync(req.resolve(`${name}/package.json`)));
  } catch {
    // Packages whose exports hide package.json: walk node_modules folders up from `fromDir`.
    for (let dir = fromDir; ; dir = dirname(dir)) {
      const candidate = join(dir, 'node_modules', name, 'package.json');
      if (existsSync(candidate)) return dirname(realpathSync(candidate));
      if (dirname(dir) === dir) return null;
    }
  }
}

/** Runtime dependencies of the app, and theirs, as package folders. */
function runtimeClosure() {
  const seen = new Set();
  const queue = Object.keys(readJson(join(app, 'package.json')).dependencies ?? {}).map((n) => [
    n,
    app,
  ]);
  while (queue.length) {
    const [name, from] = queue.shift();
    const dir = resolvePackage(name, from);
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const pkg = readJson(join(dir, 'package.json'));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      queue.push([dep, dir]);
    }
  }
  return seen;
}

function bundledDirs() {
  const dir = join(out, '.licenses');
  if (!existsSync(dir)) throw new Error('out/.licenses is missing: run the builds first');
  const dirs = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const d of readJson(join(dir, file))) {
      if (existsSync(join(d, 'package.json'))) dirs.add(realpathSync(d));
    }
  }
  return dirs;
}

const packages = new Map();
for (const dir of [...bundledDirs(), ...runtimeClosure()]) {
  const pkg = readJson(join(dir, 'package.json'));
  if (!pkg.name || pkg.name.startsWith('@trifold/')) continue;
  const key = `${pkg.name}@${pkg.version}`;
  if (packages.has(key)) continue;
  const licence =
    typeof pkg.license === 'string'
      ? pkg.license
      : (pkg.license?.type ?? pkg.licenses?.map((l) => l.type ?? l).join(' OR ') ?? 'UNKNOWN');
  const texts = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').trim());
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  packages.set(key, { name: pkg.name, version: pkg.version, licence, texts, author });
}

const list = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
const missing = list.filter((p) => p.texts.length === 0);
const parts = [
  'Third-party software in Trifold',
  '',
  'Trifold includes the open-source libraries below. Each is used under its own licence, whose',
  'text follows. Trifold itself is licensed under the GNU General Public License, version 3 or',
  'later; Electron and Chromium ship their own licence files beside the app.',
  '',
  ...list.map((p) => `- ${p.name} ${p.version} (${p.licence})`),
  '',
];
for (const p of list) {
  parts.push('='.repeat(72), `${p.name} ${p.version}`, `Licence: ${p.licence}`, '');
  parts.push(
    p.texts.length
      ? p.texts.join('\n\n')
      : `(No licence file in the package; it declares ${p.licence}${p.author ? `, by ${p.author}` : ''}.)`,
    '',
  );
}
writeFileSync(join(out, 'THIRD_PARTY_NOTICES.txt'), parts.join('\n'), 'utf8');
console.log(
  `third-party-notices: ${list.length} packages, ${missing.length} without a licence file${
    missing.length ? ` (${missing.map((p) => p.name).join(', ')})` : ''
  }`,
);
