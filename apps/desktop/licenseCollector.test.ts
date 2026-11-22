import { describe, expect, it } from 'vitest';
import { packageDirOf } from './licenseCollector';

/** Third-party notices (ADR 0056): which package a bundled module comes from. */
describe('packageDirOf', () => {
  it('finds plain and scoped packages, the innermost node_modules winning', () => {
    expect(packageDirOf('/repo/node_modules/react/index.js')).toBe('/repo/node_modules/react');
    expect(
      packageDirOf(
        '/repo/node_modules/.pnpm/@tiptap+core@3.33.0/node_modules/@tiptap/core/dist/index.js',
      ),
    ).toBe('/repo/node_modules/.pnpm/@tiptap+core@3.33.0/node_modules/@tiptap/core');
  });

  it('reads Windows paths and virtual ids, and skips the project’s own files', () => {
    expect(packageDirOf('C:\\r\\node_modules\\zod\\lib\\index.mjs?commonjs-proxy')).toBe(
      'C:/r/node_modules/zod',
    );
    expect(packageDirOf('\0/r/node_modules/ulid/dist/index.esm.js')).toBe('/r/node_modules/ulid');
    expect(packageDirOf('/repo/packages/rules/src/dice.ts')).toBeNull();
  });
});
