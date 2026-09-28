import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'resources/**',
      'fixtures/local/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts,mjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // The renderer never touches Electron, the file system or SQLite directly (CLAUDE.md, repo layout).
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'The renderer talks to main only through window.trifold.',
            },
            { name: 'fs', message: 'No file access in the renderer; go through window.trifold.' },
            {
              name: 'node:fs',
              message: 'No file access in the renderer; go through window.trifold.',
            },
            { name: 'fs/promises', message: 'No file access in the renderer.' },
            { name: 'node:fs/promises', message: 'No file access in the renderer.' },
            { name: 'better-sqlite3', message: 'SQLite lives in the main process only.' },
          ],
        },
      ],
    },
  },
  prettier,
);
