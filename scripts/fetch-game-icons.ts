// Build-time only (DESIGN.md §6.8). Clones github.com/game-icons/icons at depth 1, copies every
// SVG into resources/icons/svg/<name>.svg, writes resources/icons/credits.json (authors and
// their icon counts, for the About page) and refreshes the committed resources/icons/manifest.json.
// The SVG set and credits are git-ignored; only the manifest and mapping tables are committed.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/game-icons/icons.git';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS_DIR = join(ROOT, 'resources', 'icons');
const SVG_DIR = join(ICONS_DIR, 'svg');
const BACKGROUND_SQUARE = /<path d="M0 0h512v512H0z"[^>]*\/>/;

interface Credits {
  license: { name: string; url: string };
  source: string;
  authors: Array<{ name: string; icons: number }>;
}

function run(cmd: string, args: string[], cwd?: string): void {
  // No shell: paths with spaces (node under Program Files) must reach the child untouched.
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
}

function main(): void {
  const work = mkdtempSync(join(tmpdir(), 'game-icons-'));
  try {
    console.log(`cloning ${REPO}`);
    run('git', ['clone', '--depth', '1', '--quiet', REPO, join(work, 'icons')]);
    const repo = join(work, 'icons');
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).stdout.trim();

    rmSync(SVG_DIR, { recursive: true, force: true });
    mkdirSync(SVG_DIR, { recursive: true });

    // Layout: <author>/<icon>.svg at the repo root. Names are unique across authors; keep the
    // first on a collision and say so.
    const authors: Array<{ name: string; icons: number }> = [];
    const seen = new Map<string, string>();
    let copied = 0;
    for (const author of readdirSync(repo, { withFileTypes: true })) {
      if (!author.isDirectory() || author.name.startsWith('.')) continue;
      const dir = join(repo, author.name);
      let count = 0;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.svg')) continue;
        const name = basename(file, '.svg');
        const owner = seen.get(name);
        if (owner) {
          console.warn(`duplicate icon name ${name}: keeping ${owner}, skipping ${author.name}`);
          continue;
        }
        seen.set(name, author.name);
        // The repo SVGs start with a black 512×512 square behind a white glyph. The renderer
        // masks with the glyph's alpha, so drop the square and keep only the glyph.
        const svg = readFileSync(join(dir, file), 'utf8').replace(BACKGROUND_SQUARE, '');
        writeFileSync(join(SVG_DIR, file), svg);
        count += 1;
        copied += 1;
      }
      if (count > 0) authors.push({ name: author.name, icons: count });
    }
    authors.sort((a, b) => b.icons - a.icons || a.name.localeCompare(b.name));

    const licenseText = existsSync(join(repo, 'license.txt'))
      ? readFileSync(join(repo, 'license.txt'), 'utf8')
      : '';
    const credits: Credits = {
      license: { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
      source: 'https://game-icons.net',
      authors,
    };
    writeFileSync(join(ICONS_DIR, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
    writeFileSync(join(ICONS_DIR, 'license.txt'), licenseText);
    writeFileSync(
      join(ICONS_DIR, 'manifest.json'),
      JSON.stringify(
        {
          source: REPO,
          commit,
          fetchedAt: new Date().toISOString(),
          icons: copied,
          authors: authors.length,
          license: 'CC BY 3.0',
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`copied ${copied} icons from ${authors.length} authors (${commit.slice(0, 8)})`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  console.log('verifying mapping tables');
  run(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'verify-mapping.ts')]);
}

main();
