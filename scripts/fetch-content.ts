// Build-time only. Runs every content fetch step in order (DESIGN.md §6.1 and §6.8):
//   1. Open5e SRD snapshot  → resources/srd-*.jsonl + srd-manifest.json
//   2. game-icons SVG set   → resources/icons/ (arrives with the presenter token work)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const steps = [['Open5e SRD snapshot', join(here, 'fetch-open5e.ts')]];

for (const [label, script] of steps) {
  console.log(`== ${label}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', script!], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
