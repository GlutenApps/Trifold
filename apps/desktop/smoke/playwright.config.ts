import { defineConfig } from '@playwright/test';

/** Drives the built app (out/) inside Electron. Run with `pnpm smoke` from the repo root. */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../test-results',
  use: {
    trace: 'retain-on-failure',
  },
});
