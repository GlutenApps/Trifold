import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/**/*.test.ts',
            'apps/desktop/src/main/**/*.test.ts',
            'apps/desktop/src/preload/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['apps/desktop/src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/desktop/src/renderer/test/setup.ts'],
        },
      },
    ],
  },
});
