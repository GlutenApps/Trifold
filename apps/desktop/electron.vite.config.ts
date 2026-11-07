import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// The renderer's CSP allows localhost websockets so the dev server can hot-reload. A packaged
// build has no dev server, so the production index.html loses those two sources.
const productionCsp = (): Plugin => ({
  name: 'trifold-production-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(' ws://localhost:* http://localhost:*', ''),
  },
});

// Entries default to src/main/index.ts, src/preload/index.ts and src/renderer/index.html.
// externalizeDepsPlugin keeps `dependencies` (the native better-sqlite3) out of the bundle;
// workspace packages are devDependencies and are bundled in.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react(), productionCsp()],
  },
});
