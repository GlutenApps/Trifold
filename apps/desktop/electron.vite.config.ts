import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

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
    plugins: [react()],
  },
});
