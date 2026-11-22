import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Third-party notices (ADR 0056): every build records which node_modules packages ended up in its
 * bundle, in out/.licenses/<target>.json. scripts/third-party-notices.mjs then adds the main
 * process's runtime dependencies (kept out of the bundle and shipped as they are) and writes the
 * licence texts of them all to out/THIRD_PARTY_NOTICES.txt, which the package carries.
 */

/** The package folder a module id lives in, or null for the project's own files. */
export function packageDirOf(id: string): string | null {
  const path = id.replace(/\\/g, '/').replace(/^\0/, '').split('?')[0] ?? '';
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const rest = path.slice(at + '/node_modules/'.length).split('/');
  const name = rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1] ?? ''}` : rest[0];
  if (!name) return null;
  return `${path.slice(0, at)}/node_modules/${name}`;
}

export function licenseCollector(target: string): Plugin {
  return {
    name: 'trifold-license-collector',
    apply: 'build',
    generateBundle(_options, bundle) {
      const dirs = new Set<string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of Object.keys(chunk.modules)) {
          const dir = packageDirOf(id);
          if (dir) dirs.add(dir);
        }
      }
      const out = resolve(__dirname, 'out', '.licenses');
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${target}.json`), `${JSON.stringify([...dirs].sort(), null, 2)}\n`);
    },
  };
}
