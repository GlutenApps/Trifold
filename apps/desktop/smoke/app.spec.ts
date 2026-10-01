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
    /** Library nav rows, stage tabs and dock tool toggles, by their exact names. */
    const libNav = (name: string) =>
      console_
        .getByRole('navigation', { name: 'Library' })
        .getByRole('button', { name, exact: true });
    const tab = (name: string) => console_.getByRole('tab', { name, exact: true });
    const dockTool = (name: string) =>
      console_.getByTestId('dock').getByRole('button', { name: `${name} tool`, exact: true });
    const strip = console_.getByTestId('live-strip');
    const rendererErrors: string[] = [];
    console_.on('console', (msg) => {
      if (msg.type() === 'error') rendererErrors.push(msg.text());
    });

    // Nothing is open, so the window starts in the Library.
    await expect(console_.getByTestId('library')).toBeVisible();
    await expect(console_).toHaveTitle('Trifold');

    // Library folder layout and settings file were created atomically on first run.
    const settings = JSON.parse(await readFile(join(library, 'library.json'), 'utf8'));
    expect(settings.schemaVersion).toBe(3);
    await expect(stat(join(library, 'sources'))).resolves.toBeTruthy();

    // The native SQLite index opened inside Electron.
    await libNav('Settings').click();
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
    await libNav('Compendium').click();
    await console_.getByRole('button', { name: 'Sources', exact: true }).click();
    const importedRow = console_.getByTestId('source-row').filter({ hasText: 'compendium-sample' });
    await expect(importedRow).toHaveCount(1);

    // A manual backup lands in Library/backups (the daily one may already be there).
    await libNav('Settings').click();
    await console_.getByRole('button', { name: 'Back up now' }).click();
    await expect(console_.getByTestId('backup-row').filter({ hasText: 'manual' })).toHaveCount(1);
    await libNav('Compendium').click();
    await console_.getByRole('button', { name: 'Browse', exact: true }).click();

    // A second import of the same file is a no-op by hash.
    const again = await console_.evaluate(
      (path) => window.trifold.sources.importFile(path),
      FIXTURE,
    );
    expect(again.status).toBe('unchanged');

    // Search with FTS and filters, open a stat block, follow a spell link, switch editions.
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

    // Homebrew: duplicate, edit, see the diff, delete (DESIGN.md §6.2).
    await console_.getByRole('button', { name: 'Duplicate to homebrew' }).click();
    const editor = console_.getByTestId('monster-editor');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Name', { exact: true }).fill('Aboleth Elder');
    await editor.getByLabel('Challenge rating').selectOption('12');
    await editor.getByRole('button', { name: 'Save' }).first().click();
    await expect(console_.getByRole('heading', { name: 'Aboleth Elder' })).toBeVisible();
    await console_.getByRole('button', { name: 'Changes from original' }).click();
    await expect(console_.getByTestId('record-diff')).toContainText('Aboleth Elder');
    await expect(console_.getByTestId('record-diff')).toContainText('12');
    await console_.getByRole('button', { name: 'Delete…' }).click();
    await console_.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(console_.getByRole('heading', { name: 'Aboleth Elder' })).toHaveCount(0);

    await console_.getByLabel('Search').fill('');
    await console_.getByLabel('Edition', { exact: true }).selectOption('all');
    await console_.getByRole('option', { name: /^Mage/ }).click();
    await console_.getByRole('button', { name: 'Fireball' }).click();
    await expect(console_.getByRole('heading', { name: 'Fireball' })).toBeVisible();
    await expect(console_.getByText('Level 3 Evocation')).toBeVisible();
    await console_.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(console_.getByRole('heading', { name: 'Mage' })).toBeVisible();

    const timing = await console_.evaluate(
      (id) =>
        window.trifold.compendium.search({ kind: 'monster', text: 'dragon', sourceIds: [id] }),
      report.sourceId,
    );
    expect(timing.total).toBe(1);
    expect(timing.tookMs).toBeLessThan(50);

    // Campaign: create one in the Library; opening it enters the console with its tabs.
    await libNav('Campaigns').click();
    await console_.getByLabel('New campaign name').fill('Smoke Campaign');
    await console_.getByRole('button', { name: 'Create campaign' }).click();
    await expect(console_.getByRole('heading', { name: 'Smoke Campaign' })).toBeVisible();
    await expect(tab('Campaign')).toHaveAttribute('aria-selected', 'true');
    await expect(strip).toBeVisible();
    await console_
      .getByLabel('Quick add')
      .fill('Thora, Sam, Fighter 5, 44, 18, +1, 30, 12\nZed, Kim, Wizard 5, 28, 12, +2, 30, 10');
    await console_.getByRole('button', { name: 'Add PCs' }).click();
    await expect(console_.getByTestId('pc-row')).toHaveCount(2);
    await expect(
      stat(join(library, 'campaigns', 'smoke-campaign', 'campaign.json')),
    ).resolves.toBeTruthy();

    // Encounter: party plus three goblins from the fixture, budget shown, then combat.
    await tab('Encounters').click();
    await console_.getByRole('button', { name: 'New encounter' }).click();
    await console_.getByRole('button', { name: 'Add all PCs' }).click();
    await console_.getByLabel('Add creature').fill('goblin warrior');
    const creatureResults = console_.getByRole('listbox', { name: 'Creature results' });
    await creatureResults
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
    await console_.getByLabel('Add creature').fill('mage');
    // The fixture's 2014 Mage carries <slots>; the bundled 2024 one describes spells in text.
    await creatureResults
      .getByRole('option', { name: /^Mage/ })
      .filter({ hasText: 'compendium-sample' })
      .first()
      .click();
    await expect(console_.getByTestId('template-row')).toHaveCount(4);
    await console_.getByRole('button', { name: 'Start combat' }).click();
    await expect(console_.getByRole('heading', { name: /Set initiative/ })).toBeVisible();
    await expect(console_.getByTestId('combatant-row')).toHaveCount(6);
    await console_.getByRole('button', { name: /Roll remaining/ }).click();

    // The log can be exported as text (the save dialog itself is native, so only the control).
    await expect(console_.getByRole('button', { name: 'export', exact: true })).toBeVisible();

    // A row click opens its drawer, or folds it when that row is already open (rolled initiative
    // decides who starts selected), so click again if the drawer is not the one wanted.
    const openRow = async (name: string) => {
      await console_.getByTestId('combatant-row').filter({ hasText: name }).click();
      const drawer = console_.getByRole('region', { name: `${name} controls` });
      if (!(await drawer.isVisible())) {
        await console_.getByTestId('combatant-row').filter({ hasText: name }).click();
      }
      await expect(drawer).toBeVisible();
    };

    // The Mage's slot tracker: one pip per slot, click to spend.
    await openRow('Mage');
    const tracker = console_.getByTestId('slot-tracker');
    await expect(tracker).toBeVisible();
    await expect(tracker.getByRole('button', { name: 'Spend level 1 slot' })).toHaveCount(4);
    await tracker.getByRole('button', { name: 'Spend level 1 slot' }).first().click();
    await expect(tracker.getByRole('button', { name: 'Spend level 1 slot' })).toHaveCount(3);
    await expect(tracker.getByRole('button', { name: 'Restore level 1 slot' })).toHaveCount(1);
    await console_.getByRole('button', { name: 'Begin' }).click();
    await expect(console_.getByRole('heading', { name: /Round 1/ })).toBeVisible();

    await openRow('Goblin Warrior 1');
    await console_
      .getByRole('button', { name: /1d6\+2 slashing/ })
      .first()
      .click();
    await expect(console_.getByRole('list', { name: 'Combat log' })).toContainText('Scimitar');
    // The rolled damage opens the pop-up; the DM picks who takes it, full or half each.
    const damagePopup = console_.getByRole('dialog', { name: /Goblin Warrior 1 — Scimitar/ });
    await expect(damagePopup).toBeVisible();
    await damagePopup.getByRole('button', { name: 'Full damage to Thora' }).click();
    await damagePopup.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(damagePopup).toHaveCount(0);
    await expect(console_.getByRole('list', { name: 'Combat log' })).toContainText(
      'applied to Thora',
    );
    await console_.getByLabel('Amount').fill('4');
    await console_.getByRole('button', { name: 'Damage', exact: true }).click();
    await expect(
      console_.getByTestId('combatant-row').filter({ hasText: 'Goblin Warrior 1' }),
    ).toContainText('/');
    await console_.getByRole('button', { name: 'Next turn (N)' }).click();
    await expect(console_.getByRole('list', { name: 'Combat log' })).toContainText("'s turn");
    await console_.getByRole('button', { name: 'End combat' }).click();
    await tab('Encounters').click();
    await expect(console_.getByTestId('encounter-row')).toContainText('fought 1×');

    // The strip rolls the shared pool; the Dice tool in the dock shows the one log.
    await strip.getByRole('button', { name: 'Add d6 (tray)' }).click();
    await strip.getByRole('button', { name: 'Add d6 (tray)' }).click();
    await strip.getByRole('button', { name: 'Roll the pool (tray)' }).click();
    await expect(strip.getByLabel('Last roll')).not.toHaveText('–');
    await expect(console_.getByRole('list', { name: 'Roll log' })).toContainText('2d6');

    // Open the player window from the strip; the Scenes tool sends a title card through main.
    const playerPromise = app.waitForEvent('window');
    await strip.getByRole('button', { name: 'Open player window' }).click();
    const player = await playerPromise;
    await expect(player).toHaveTitle('Trifold player');
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    await dockTool('Scenes').click();
    await console_.getByLabel('New scene title').fill('The Sunken Keep');
    await console_.getByRole('button', { name: 'New title card' }).click();
    await expect(console_.getByTestId('scene-row')).toHaveCount(1);
    // Click selects; Enter sends (nothing goes live by accident).
    await console_.getByTestId('scene-row').click();
    await expect(player.getByRole('heading', { name: 'The Sunken Keep' })).toHaveCount(0);
    await console_.getByTestId('scene-row').press('Enter');
    await expect(player.getByRole('heading', { name: 'The Sunken Keep' })).toBeVisible();
    await expect(console_.getByTestId('live-status')).toHaveText('Live: The Sunken Keep');
    await dockTool('TV controls').click();
    await console_.getByLabel('Handout title').fill('Letter');
    await console_.getByLabel('Handout text').fill('Come at dusk.');
    await console_.getByRole('button', { name: 'Show text handout' }).click();
    await expect(player.getByTestId('handout')).toContainText('Come at dusk.');
    await console_.getByRole('button', { name: 'Dismiss handout' }).click();
    await expect(player.getByTestId('handout')).toHaveCount(0);
    await strip.getByRole('button', { name: 'Blackout' }).click();
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    // A blank grid goes live, the party lands where the DM clicks, and the TV mirrors it.
    // The Map tab's empty state offers the same button while hidden; use the Scenes tool's.
    await console_.getByTestId('dock').getByRole('button', { name: 'New blank grid' }).click();
    const gridRow = console_.getByTestId('scene-row').filter({ hasText: 'Blank grid' });
    await expect(gridRow).toHaveAttribute('aria-selected', 'true');
    await expect(tab('Map')).toHaveAttribute('aria-selected', 'true');
    await gridRow.press('Enter');
    await expect(player.getByTestId('map-layer')).toBeVisible();
    await console_.getByRole('button', { name: 'Add player characters' }).click();
    await console_.getByRole('button', { name: 'Place whole party' }).click();
    const canvas = console_.getByTestId('map-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(console_.getByTestId('console-token')).toHaveCount(2);
    await expect(player.getByTestId('player-token')).toHaveCount(2);
    await expect(player.getByTestId('map-layer')).toContainText('Thora');

    // Music: a folder is scanned in place, the track lists, and Play reaches the tray.
    const songs = await mkdtemp(join(tmpdir(), 'trifold-songs-'));
    await writeFile(join(songs, 'Tavern Night.wav'), silentWav(2));
    await console_.evaluate((dir) => window.trifold.music.addFolder(dir), songs);
    await dockTool('Music').click();
    await expect(console_.getByTestId('track-row')).toHaveCount(1);
    await expect(console_.getByTestId('track-row')).toContainText('Tavern Night');
    await console_.getByTestId('track-row').getByRole('button', { name: 'Play now' }).click();
    await expect(console_.getByRole('contentinfo')).toContainText('Tavern Night');
    await expect(
      console_.getByTestId('music-player').getByRole('button', { name: 'Pause', exact: true }),
    ).toBeVisible();

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
