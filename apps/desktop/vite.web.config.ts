import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The player connector's browser client (ADR 0043): a small React page the table server serves
 * from `out/web`. Built beside the Electron bundles, so its version always matches the app's.
 * `pnpm dev` runs this with `--watch`, so a phone reload picks up a change.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: '/',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    target: ['es2020', 'safari14'],
    // Small enough to inline nothing: the server's CSP allows only same-origin files.
    assetsInlineLimit: 0,
  },
});
