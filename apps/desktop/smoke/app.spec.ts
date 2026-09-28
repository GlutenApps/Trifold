import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { TrifoldBridge } from '@trifold/api';

// Page-side callbacks in `evaluate` run in the renderer, where the preload exposes window.trifold.
declare const window: { trifold: TrifoldBridge };

const FIXTURE = resolve(__dirname, '..', '..', '..', 'fixtures', 'compendium-sample.xml');

/**
 * Smoke test (DESIGN.md §10): launch, create a Library, import the fixture, search and open a
 * stat block, open the player window on a display, push a title card and black out.
 */
test('console, Library, import, search, stat block and player window all work end to end', async () => {
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

    // The native SQLite index opened inside Electron.
    await console_.getByRole('button', { name: 'Settings' }).click();
    await expect(console_.getByTestId('index-status')).toHaveText('Index: ok');

    // Import the SRD-only fixture through the API (no native dialog) and see it listed.
    const report = await console_.evaluate(
      (path) => window.trifold.sources.importFile(path),
      FIXTURE,
    );
    expect(report.status).toBe('imported');
    expect(report.counts.monster).toBe(6);
    expect(report.warnings).toEqual([]);
    await expect(
      stat(join(library, 'sources', report.sourceId, 'records.jsonl')),
    ).resolves.toBeTruthy();
    await console_.getByRole('button', { name: 'Compendium' }).click();
    await console_.getByRole('button', { name: 'Settings' }).click();
    const importedRow = console_.getByTestId('source-row').filter({ hasText: 'compendium-sample' });
    await expect(importedRow).toHaveCount(1);

    // A manual backup lands in Library/backups (the daily one may already be there).
    await console_.getByRole('button', { name: 'Back up now' }).click();
    await expect(console_.getByTestId('backup-row').filter({ hasText: 'manual' })).toHaveCount(1);

    // A second import of the same file is a no-op by hash.
    const again = await console_.evaluate(
      (path) => window.trifold.sources.importFile(path),
      FIXTURE,
    );
    expect(again.status).toBe('unchanged');

    // Search with FTS and filters, open a stat block, follow a spell link, switch editions.
    await console_.getByRole('button', { name: 'Compendium' }).click();
    await console_
      .getByLabel('Source', { exact: true })
      .selectOption({ label: 'compendium-sample' });
    await expect(console_.getByRole('listbox', { name: 'Results' })).toContainText('6 results');
    await console_.getByLabel('Search').fill('abol');
    await expect(console_.getByRole('option', { name: /Aboleth/ })).toHaveCount(2);
    await console_.getByLabel('Edition', { exact: true }).selectOption('2024');
    await expect(console_.getByRole('option', { name: /Aboleth/ })).toHaveCount(1);
    await console_.getByRole('option', { name: /Aboleth/ }).click();
    await expect(console_.getByRole('heading', { name: 'Aboleth' })).toBeVisible();
    await expect(console_.getByRole('group', { name: 'Switch edition' })).toContainText('Legacy');
    await console_
      .getByRole('group', { name: 'Switch edition' })
      .getByRole('button', { name: /^Legacy/ })
      .first()
      .click();
    await expect(console_.getByRole('heading', { name: 'Legendary actions' })).toBeVisible();

    await console_.getByLabel('Search').fill('');
    await console_.getByLabel('Edition', { exact: true }).selectOption('all');
    await console_.getByRole('option', { name: /^Mage/ }).click();
    await console_.getByRole('button', { name: 'Fireball' }).click();
    await expect(console_.getByRole('heading', { name: 'Fireball' })).toBeVisible();
    await expect(console_.getByText('Level 3 Evocation')).toBeVisible();
    await console_.getByRole('button', { name: 'Back' }).click();
    await expect(console_.getByRole('heading', { name: 'Mage' })).toBeVisible();

    const timing = await console_.evaluate(
      (id) =>
        window.trifold.compendium.search({ kind: 'monster', text: 'dragon', sourceIds: [id] }),
      report.sourceId,
    );
    expect(timing.total).toBe(1);
    expect(timing.tookMs).toBeLessThan(50);

    // Campaign: create one and quick-add two PCs.
    await console_.getByRole('button', { name: 'Campaign' }).click();
    await console_.getByLabel('New campaign name').fill('Smoke Campaign');
    await console_.getByRole('button', { name: 'Create campaign' }).click();
    await expect(console_.getByRole('heading', { name: 'Smoke Campaign' })).toBeVisible();
    await console_
      .getByLabel('Quick add')
      .fill('Thora, Sam, Fighter 5, 44, 18, +1, 30, 12\nZed, Kim, Wizard 5, 28, 12, +2, 30, 10');
    await console_.getByRole('button', { name: 'Add PCs' }).click();
    await expect(console_.getByTestId('pc-row')).toHaveCount(2);
    await expect(
      stat(join(library, 'campaigns', 'smoke-campaign', 'campaign.json')),
    ).resolves.toBeTruthy();

    // Encounter: party plus three goblins from the fixture, budget shown, then combat.
    await console_.getByRole('button', { name: 'Encounters' }).click();
    await console_.getByRole('button', { name: 'New encounter' }).click();
    await console_.getByRole('button', { name: 'Add all PCs' }).click();
    await console_.getByLabel('Add creature').fill('goblin warrior');
    await console_
      .getByRole('option', { name: /Goblin Warrior/ })
      .first()
      .click();
    await expect(console_.getByTestId('template-row')).toHaveCount(3);
    await console_
      .getByTestId('template-row')
      .filter({ hasText: 'Goblin Warrior' })
      .locator('input[type="number"]')
      .fill('3');
    await expect(console_.getByTestId('difficulty')).toContainText('Enemy XP 150');
    await console_.getByRole('button', { name: 'Start combat' }).click();
    await expect(console_.getByRole('heading', { name: /Set initiative/ })).toBeVisible();
    await expect(console_.getByTestId('combatant-row')).toHaveCount(5);
    await console_.getByRole('button', { name: /Roll remaining/ }).click();
    await console_.getByRole('button', { name: 'Begin' }).click();
    await expect(console_.getByRole('heading', { name: /Round 1/ })).toBeVisible();

    await console_.getByTestId('combatant-row').filter({ hasText: 'Goblin Warrior 1' }).click();
    await console_
      .getByRole('button', { name: /1d6\+2 slashing/ })
      .first()
      .click();
    await expect(console_.getByRole('list', { name: 'Combat log' })).toContainText('Scimitar');
    await console_.getByLabel('Amount').fill('4');
    await console_.getByRole('button', { name: 'Damage', exact: true }).click();
    await expect(
      console_.getByTestId('combatant-row').filter({ hasText: 'Goblin Warrior 1' }),
    ).toContainText('/');
    await console_.getByRole('button', { name: /Next turn/ }).click();
    await expect(console_.getByRole('list', { name: 'Combat log' })).toContainText("'s turn");
    await console_.getByRole('button', { name: 'End combat' }).click();
    await expect(console_.getByTestId('encounter-row')).toContainText('fought 1×');

    // Dice page rolls into the shared log.
    await console_.getByRole('button', { name: 'Dice' }).click();
    await console_.getByLabel('Dice expression').fill('2d6+3');
    await console_.getByRole('button', { name: 'Roll', exact: true }).click();
    await expect(console_.getByRole('list', { name: 'Roll log' })).toContainText('2d6+3');

    // Open the player window and push a title card through main.
    await console_.getByRole('button', { name: 'Presenter' }).click();
    const playerPromise = app.waitForEvent('window');
    await console_.getByRole('button', { name: 'Open player window' }).click();
    const player = await playerPromise;
    await expect(player).toHaveTitle('Trifold player');
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    await console_.getByLabel('New scene title').fill('The Sunken Keep');
    await console_.getByRole('button', { name: 'New title card' }).click();
    await expect(console_.getByTestId('scene-row')).toHaveCount(1);
    await console_.getByRole('button', { name: 'The Sunken Keep' }).click();
    await expect(player.getByRole('heading', { name: 'The Sunken Keep' })).toBeVisible();
    await expect(console_.getByRole('contentinfo')).toContainText('Live scene: The Sunken Keep');
    await console_.getByLabel('Handout title').fill('Letter');
    await console_.getByLabel('Handout text').fill('Come at dusk.');
    await console_.getByRole('button', { name: 'Show text handout' }).click();
    await expect(player.getByTestId('handout')).toContainText('Come at dusk.');
    await console_.getByRole('button', { name: 'Dismiss handout' }).click();
    await expect(player.getByTestId('handout')).toHaveCount(0);
    await console_.getByRole('button', { name: 'Blackout' }).click();
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    // A blank grid goes live, the party lands where the DM clicks, and the TV mirrors it.
    await console_.getByRole('button', { name: 'New blank grid' }).click();
    await console_
      .getByTestId('scene-row')
      .filter({ hasText: 'Blank grid' })
      .locator('.scene-title')
      .click();
    await expect(player.getByTestId('map-layer')).toBeVisible();
    await console_.getByRole('button', { name: 'Place party' }).click();
    const canvas = console_.getByTestId('map-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(console_.getByTestId('console-token')).toHaveCount(2);
    await expect(player.getByTestId('player-token')).toHaveCount(2);
    await expect(player.getByTestId('map-layer')).toContainText('Thora');

    // Music: a folder is scanned in place, the track lists, and Play reaches the status bar.
    const songs = await mkdtemp(join(tmpdir(), 'trifold-songs-'));
    await writeFile(join(songs, 'Tavern Night.wav'), silentWav(2));
    await console_.evaluate((dir) => window.trifold.music.addFolder(dir), songs);
    await console_.getByRole('button', { name: 'Music' }).click();
    await expect(console_.getByTestId('track-row')).toHaveCount(1);
    await expect(console_.getByTestId('track-row')).toContainText('Tavern Night');
    await console_.getByTestId('track-row').getByRole('button', { name: 'Play now' }).click();
    await expect(console_.getByRole('contentinfo')).toContainText('Now playing: Tavern Night');
    await expect(console_.getByTestId('music-player')).toContainText('Pause');
    await console_.getByRole('button', { name: 'Presenter' }).click();

    // Bundled glyphs are served to the player over the media scheme (only when fetched).
    if (existsSync(join(__dirname, '..', '..', '..', 'resources', 'icons', 'svg'))) {
      const loads = (url: string) =>
        player.evaluate(
          (src) =>
            new Promise<boolean>((resolve) => {
              // The smoke project has no DOM lib; this runs in the page.
              type Img = {
                onload: (() => void) | null;
                onerror: (() => void) | null;
                src: string;
                naturalWidth: number;
              };
              const doc = (globalThis as unknown as { document: { createElement(t: 'img'): Img } })
                .document;
              const img = doc.createElement('img');
              img.onload = () => resolve(img.naturalWidth > 0);
              img.onerror = () => resolve(false);
              img.src = src;
            }),
          url,
        );
      expect(await loads('trifold-media://icons/position-marker.svg')).toBe(true);
      expect(await loads('trifold-media://icons/no-such-glyph.svg')).toBe(false);
    }

    expect(rendererErrors).toEqual([]);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
  }
});

/** A valid silent 16-bit mono PCM WAV of `seconds` at 8 kHz. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(Math.round(seconds * rate) * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
