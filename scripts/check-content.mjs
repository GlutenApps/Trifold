// Build guard: refuses to package Trifold without the fetched content (CLAUDE.md ground rule 3,
// ADR 0006). `pnpm fetch:content` writes the SRD snapshot and the game-icons set into resources/;
// only the manifests are committed, so a clean clone can build a silently content-less installer.
// This runs as `prebuild` in apps/desktop and in the release workflow.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resources = join(root, 'resources');
const problems = [];

// SRD documents: every file named in srd-manifest.json must exist with the recorded hash.
const manifestPath = join(resources, 'srd-manifest.json');
if (!existsSync(manifestPath)) {
  problems.push('resources/srd-manifest.json is missing');
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const doc of manifest.documents ?? []) {
    const file = join(resources, doc.file);
    if (!existsSync(file)) {
      problems.push(`resources/${doc.file} (${doc.key}) is missing`);
      continue;
    }
    const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (doc.sha256 && sha256 !== doc.sha256) {
      problems.push(`resources/${doc.file} does not match the hash in srd-manifest.json`);
    }
  }
}

// Icons: the svg set, its credits and licence, and the count the manifest recorded.
const iconsDir = join(resources, 'icons');
const iconManifestPath = join(iconsDir, 'manifest.json');
if (!existsSync(iconManifestPath)) {
  problems.push('resources/icons/manifest.json is missing');
} else {
  const iconManifest = JSON.parse(readFileSync(iconManifestPath, 'utf8'));
  const svgDir = join(iconsDir, 'svg');
  const count = existsSync(svgDir)
    ? readdirSync(svgDir).filter((f) => f.endsWith('.svg')).length
    : 0;
  if (count === 0) problems.push('resources/icons/svg/ is missing or empty');
  else if (iconManifest.icons && count !== iconManifest.icons) {
    problems.push(
      `resources/icons/svg/ has ${count} icons; manifest.json recorded ${iconManifest.icons}`,
    );
  }
  for (const name of ['credits.json', 'license.txt']) {
    if (!existsSync(join(iconsDir, name))) problems.push(`resources/icons/${name} is missing`);
  }
}

if (problems.length) {
  console.error('check-content: the build would ship without bundled content:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Run `pnpm fetch:content` (needs network) and build again.');
  process.exit(1);
}
console.log('check-content: SRD snapshot and icon set present');
