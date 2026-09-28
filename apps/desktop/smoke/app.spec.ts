import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

/**
 * M0 smoke test (DESIGN.md §10): launch, create a Library, open the player window on a display,
 * push a title card from the console and see it on the player, then black out.
 */
test('console opens, Library is created, player window mirrors presenter state', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'trifold-userdata-'));
  const library = await mkdtemp(join(tmpdir(), 'trifold-library-'));

  // Editors and extension hosts export ELECTRON_RUN_AS_NODE=1, which would make electron.exe run
  // as plain Node and reject Chromium switches. Never pass it through to the app under test.
  const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;

  const app = await electron.launch({
    args: [resolve(__dirname, '..')],
    env: {
      ...env,
      TRIFOLD_USER_DATA: userData,
      TRIFOLD_LIBRARY: library,
    },
  });

  try {
    const console_ = await app.firstWindow();
    const rendererErrors: string[] = [];
    console_.on('console', (msg) => {
      if (msg.type() === 'error') rendererErrors.push(msg.text());
    });

    await expect(console_.getByRole('navigation', { name: 'Sections' })).toContainText(
      'Compendium',
    );
    await expect(console_).toHaveTitle('Trifold');

    // Library folder layout and settings file were created atomically on first run.
    const settings = JSON.parse(await readFile(join(library, 'library.json'), 'utf8'));
    expect(settings.schemaVersion).toBe(1);
    await expect(stat(join(library, 'sources'))).resolves.toBeTruthy();
    await expect(stat(join(library, 'campaigns'))).resolves.toBeTruthy();

    // The native SQLite index opened inside Electron.
    await console_.getByRole('button', { name: 'Settings' }).click();
    await expect(console_.getByTestId('index-status')).toHaveText('Index: ok');
    await expect(stat(join(library, 'index.sqlite'))).resolves.toBeTruthy();

    // Open the player window and push a title card through main.
    await console_.getByRole('button', { name: 'Presenter' }).click();
    const playerPromise = app.waitForEvent('window');
    await console_.getByRole('button', { name: 'Open player window' }).click();
    const player = await playerPromise;
    await expect(player).toHaveTitle('Trifold player');
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    await console_.getByLabel('Title', { exact: true }).fill('The Sunken Keep');
    await console_.getByLabel('Subtitle', { exact: true }).fill('An M0 smoke test');
    await console_.getByRole('button', { name: 'Send to TV' }).click();
    await expect(player.getByRole('heading', { name: 'The Sunken Keep' })).toBeVisible();
    await expect(player.getByText('An M0 smoke test')).toBeVisible();
    await expect(console_.getByRole('contentinfo')).toContainText('Live scene: The Sunken Keep');

    await console_.getByRole('button', { name: 'Blackout' }).click();
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    expect(rendererErrors).toEqual([]);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
  }
});
