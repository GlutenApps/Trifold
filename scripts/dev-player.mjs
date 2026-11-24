// Opens a second copy of the app as a player, beside the one `pnpm dev` runs, so player mode
// (docs/PLAYER-MODE.md) can be tried on one computer: the first copy is the GM, this one joins it.
//
// The second copy has its own user data and its own Library, in .dev-player/ at the repo root
// (git-ignored), so it is a separate install as far as the app can tell: its own single-instance
// lock, its own settings, its own joined campaigns, kept between runs. Player mode's flag is on.
//
// It runs the main process `pnpm dev` last built into out/. With `pnpm dev` running it loads the
// renderer from the dev server, so renderer edits reload here too; without it, it uses the
// renderer in out/ from the last `pnpm build` or `pnpm smoke`. Run from apps/desktop (the
// `dev:player` script does). Pass --fresh to start from an empty Library.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'apps', 'desktop');
const home = join(root, '.dev-player');
const args = process.argv.slice(2);

if (args.includes('--fresh')) rmSync(home, { recursive: true, force: true });
mkdirSync(join(home, 'userdata'), { recursive: true });
mkdirSync(join(home, 'library'), { recursive: true });

if (!existsSync(join(desktop, 'out', 'main', 'index.js'))) {
  console.error(
    'Nothing is built yet. Start `pnpm dev` first, then run this in a second terminal.',
  );
  process.exit(1);
}

/** The dev server `pnpm dev` runs, when it is up. */
async function devServer() {
  const url = process.env.TRIFOLD_DEV_URL ?? 'http://localhost:5173';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

const url = await devServer();
if (!url && !existsSync(join(desktop, 'out', 'renderer', 'index.html'))) {
  console.error(
    'The dev server is not running and there is no built renderer. Start `pnpm dev` first.',
  );
  process.exit(1);
}

const env = { ...process.env };
// Editor terminals often export this, which makes Electron start as plain Node (see dev.mjs).
delete env.ELECTRON_RUN_AS_NODE;
Object.assign(env, {
  TRIFOLD_USER_DATA: join(home, 'userdata'),
  TRIFOLD_LIBRARY: join(home, 'library'),
  TRIFOLD_NO_SPLASH: '1',
});
if (url) env.ELECTRON_RENDERER_URL = url;
else delete env.ELECTRON_RENDERER_URL;

console.log(
  `Player copy: its Library is ${join(home, 'library')}; renderer from ${url ?? 'out/ (no hot reload)'}.`,
);
console.log(
  'In it: Library > Campaigns > Join a campaign. In the GM copy: VTT > Player devices > Let players join.',
);

// One command string where a shell is needed (Windows), so Node has no arguments to warn about.
const child =
  process.platform === 'win32'
    ? spawn('electron .', { cwd: desktop, env, stdio: 'inherit', shell: true })
    : spawn('electron', ['.'], { cwd: desktop, env, stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
