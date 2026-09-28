// Build-time check (DATA-FORMATS.md §6): every icon name in resources/icons/mapping.json must
// exist in the fetched SVG set. Exits non-zero on a missing name so a typo can't ship.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconNamesIn } from '@trifold/rules';
import { IconTables } from '@trifold/schema';

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icons');
const SVG_DIR = join(ICONS_DIR, 'svg');

if (!existsSync(SVG_DIR)) {
  console.error('resources/icons/svg is missing; run `pnpm fetch:content` first');
  process.exit(1);
}

const tables = IconTables.parse(JSON.parse(readFileSync(join(ICONS_DIR, 'mapping.json'), 'utf8')));
const available = new Set(
  readdirSync(SVG_DIR)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4)),
);
const missing = [...iconNamesIn(tables)].filter((name) => !available.has(name)).sort();

if (missing.length) {
  console.error(
    `mapping.json names ${missing.length} icon(s) not in the fetched set:\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(`mapping.json OK: ${iconNamesIn(tables).size} distinct icons, all present`);
