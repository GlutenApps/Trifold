import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { TrifoldBridge } from '@trifold/api';

// Page-side callbacks in `evaluate` run in the renderer, where the preload exposes window.trifold.
declare const window: { trifold: TrifoldBridge };

const FIXTURE = resolve(__dirname, '..', '..', '..', 'fixtures', 'compendium-sample.xml');

/**
 * The end-to-end smoke test (DESIGN.md §10) against the real Electron app, in one long session
 * on a fresh Library: first-run files and the native index; importing the SRD fixture through
 * the API, a no-op re-import, search with filters, a stat block, a spell link and an edition
 * switch; a roll pill into the shared log; homebrew duplicate, edit and delete; backups to the
 * Library and a second location with restore from file (ADR 0015); a campaign, an encounter
 * from the party and the fixture, and a fight with spell slots and rolled damage; the Dice
 * pop-up (ADR 0009); the player window, a title card sent from Scenes, the break screen from
 * the TV tab (ADR 0008) and a blank grid with the party placed; a scanned music folder and the
 * phone audio source (ADR 0007); campaign export and import; media served to the player; and
 * the on-close backup. Comments at each step say what that step proves.
 */
test('console, Library, import, search, stat block and player window all work end to end', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'trifold-userdata-'));
  const library = await mkdtemp(join(tmpdir(), 'trifold-library-'));
  const away = await mkdtemp(join(tmpdir(), 'trifold-backup-copy-'));
  let backupsAfterClose: string[] = [];

  // Editors and extension hosts export ELECTRON_RUN_AS_NODE=1, which would make electron.exe run
  // as plain Node and reject Chromium switches. Never pass it through to the app under test.
  const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;

  // TRIFOLD_SMOKE_EXE points at a packaged build (dist/win-unpacked/Trifold.exe, or on macOS
  // dist/mac*/Trifold.app/Contents/MacOS/Trifold) to run this same test against the installer's
  // app instead of out/.
  const exe = process.env['TRIFOLD_SMOKE_EXE'];
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [resolve(__dirname, '..')] }),
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
    expect(settings.schemaVersion).toBe(5);
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

    // A second location (ADR 0015): the next backup is also copied to the folder the DM picks,
    // and Restore from file takes that copy back. The native pickers answer with a set path.
    const pickNext = (path: string) =>
      app.evaluate(({ dialog }, picked) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
      }, path);
    await pickNext(away);
    await console_.getByRole('button', { name: 'Choose folder…' }).click();
    await expect(console_.getByTestId('backup-copy-target')).toContainText('Trifold backups');
    await console_.getByRole('button', { name: 'Back up now' }).click();
    await expect(console_.getByTestId('backup-copy-status')).toContainText('Last copied');
    const copies = join(away, 'Trifold backups', basename(library));
    const [copied] = await readdir(copies);
    expect(copied).toMatch(/\.zip$/);
    await pickNext(join(copies, copied!));
    await console_.getByRole('button', { name: 'Restore from file…' }).click();
    await expect(console_.getByTestId('backup-file-picked')).toContainText('1 imported source');
    await console_.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(console_.getByText(/A copy of the previous state was saved first/)).toBeVisible();
    await expect(console_.getByTestId('index-status')).toHaveText('Index: ok');
    await libNav('Compendium').click();
    await console_.getByRole('button', { name: 'Browse', exact: true }).click();

    // A second import of the same file is a no-op by hash.
    const again = await console_.evaluate(
      (path) => window.trifold.sources.importFile(path),
      FIXTURE,
    );
    expect(again.status).toBe('unchanged');

    // Search with FTS and filters, open a stat block, follow a spell link, switch editions.
    // The sample has six monsters, but its 2024 and legacy Aboleth collapse to one row (§7.2).
    await console_
      .getByLabel('Source', { exact: true })
      .selectOption({ label: 'compendium-sample' });
    await expect(console_.getByRole('listbox', { name: 'Results' })).toContainText('5 results');
    await console_.getByLabel('Search').fill('abol');
    const abolethRow = console_.getByRole('option', { name: /Aboleth/ });
    await expect(abolethRow).toHaveCount(1);
    await expect(abolethRow).toContainText('2024');
    await expect(abolethRow).toContainText('legacy');
    await console_.getByLabel('Edition', { exact: true }).selectOption('2024');
    await expect(abolethRow).toHaveCount(1);
    await expect(abolethRow).not.toContainText('legacy');
    await abolethRow.click();
    await expect(console_.getByRole('heading', { name: 'Aboleth' })).toBeVisible();
    await expect(console_.getByRole('group', { name: 'Switch edition' })).toContainText('Legacy');
    // Roll pills work outside a fight: the attack lands in the shared log and the tray total.
    await console_
      .getByRole('button', { name: /^\+9 · 2d6\+5/ })
      .first()
      .click();
    await expect(console_.getByTestId('detail-last-roll')).toContainText('Tentacle');
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
    await console_.getByRole('button', { name: 'Delete Aboleth Elder' }).click();
    await console_.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(console_.getByRole('heading', { name: 'Aboleth Elder' })).toHaveCount(0);

    await console_.getByLabel('Search').fill('');
    await console_.getByLabel('Edition', { exact: true }).selectOption('all');
    await console_.getByRole('option', { name: /^Mage/ }).click();
    await console_.getByRole('button', { name: 'Fireball' }).click();
    await expect(console_.getByRole('heading', { name: 'Fireball' })).toBeVisible();
    await expect(console_.getByText('Level 3 Evocation')).toBeVisible();
    await console_.getByRole('button', { name: 'Back to Mage' }).click();
    await expect(console_.getByRole('heading', { name: 'Mage' })).toBeVisible();

    // Conditions come with the bundled SRD snapshot (DESIGN.md §7.3): a Conditions kind with
    // one record per edition whose bulleted text renders as a list.
    await console_.getByLabel('Source', { exact: true }).selectOption({ label: 'All sources' });
    await console_.getByRole('tab', { name: 'Conditions', exact: true }).click();
    await console_.getByRole('option', { name: /^Blinded/ }).click();
    await expect(console_.getByRole('heading', { name: 'Blinded' })).toBeVisible();
    await expect(console_.getByRole('group', { name: 'Switch edition' })).toContainText('Legacy');
    await expect(console_.getByRole('listitem').first()).toBeVisible();
    await console_.getByRole('tab', { name: 'Monsters', exact: true }).click();
    await console_
      .getByLabel('Source', { exact: true })
      .selectOption({ label: 'compendium-sample' });

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
    // The picker lists every record (no edition collapse), so the sample's own Mage is reachable.
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

    // Global search (ADR 0017): Ctrl+F reaches the field whatever the window width (under
    // 960 px it sits inside the pop-up), a PC is found by name and Enter lands on their row in
    // the Campaign tab; a creature from the fixture is found through the index and opens its
    // stat block in the Compendium tab.
    await console_.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    const searchField = console_.getByRole('combobox', {
      name: 'Search the campaign and compendium',
    });
    await expect(searchField).toBeFocused();
    await searchField.fill('thora');
    const searchResults = console_.getByTestId('search-results');
    await expect(searchResults.getByRole('group', { name: 'Party' })).toContainText('Thora');
    await console_.keyboard.press('Enter');
    await expect(searchResults).toHaveCount(0);
    await expect(tab('Campaign')).toHaveAttribute('aria-selected', 'true');
    await expect(console_.getByTestId('pc-row').filter({ hasText: 'Thora' })).toBeVisible();
    await console_.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    await searchField.fill('goblin war');
    const compendiumHits = searchResults.getByRole('group', { name: 'Compendium' });
    await expect(compendiumHits).toContainText('Goblin Warrior');
    await compendiumHits.getByRole('option', { name: /Goblin Warrior/ }).click();
    await expect(tab('Compendium')).toHaveAttribute('aria-selected', 'true');
    await expect(console_.getByRole('heading', { name: 'Goblin Warrior' })).toBeVisible();
    await console_.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    await console_.keyboard.press('Escape');
    await expect(searchField).toHaveValue('');

    // Quick notes (ADR 0018): Ctrl+N opens the tool wherever the dock is (a flyout on narrow CI
    // screens), Save waits for a title, the note lands on disk in a Quick Notes folder made for
    // it, and the Notes panel shows it there; the current tab does not change.
    await console_.keyboard.press(process.platform === 'darwin' ? 'Meta+n' : 'Control+n');
    const quickTitle = console_.getByRole('textbox', { name: 'Quick note title' });
    await expect(quickTitle).toBeFocused();
    const quickSave = console_.getByRole('button', { name: 'Save', exact: true });
    await expect(quickSave).toBeDisabled();
    await quickTitle.fill('Guard took the bribe');
    await console_
      .getByTestId('quick-capture')
      .getByRole('textbox', { name: 'Body' })
      .fill('He owes the party a favour.');
    await quickSave.click();
    await expect(tab('Compendium')).toHaveAttribute('aria-selected', 'true');
    const notesDir = join(library, 'campaigns', 'smoke-campaign', 'notes');
    await expect
      .poll(async () => {
        const files = await readdir(notesDir).catch(() => [] as string[]);
        const all = await Promise.all(
          files.map(async (f) => JSON.parse(await readFile(join(notesDir, f), 'utf8'))),
        );
        const folder = all.find((n) => n.role === 'quickNotes');
        return all.find((n) => n.title === 'Guard took the bribe')?.parentId === folder?.id
          ? folder?.title
          : null;
      })
      .toBe('Quick Notes');
    await tab('Campaign').click();
    await console_.getByRole('tab', { name: /^Notes/ }).click();
    // Folders start open, so the note shows under it. (Clicking the folder would select it, and
    // a Campaign panel under 640 px, as on CI screens, then shows the folder instead of the tree.)
    await expect(console_.getByRole('treeitem', { name: 'Quick Notes' })).toBeVisible();
    await expect(console_.getByRole('treeitem', { name: 'Guard took the bribe' })).toBeVisible();

    // Global search finds a phrase inside a note body (ADR 0017) and opens the note at it.
    await console_.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    await searchField.fill('owes the party');
    const mentioned = searchResults.getByRole('group', { name: 'Mentioned in' });
    await expect(mentioned).toContainText('Guard took the bribe');
    await expect(mentioned.locator('mark')).toHaveText('owes the party');
    await console_.keyboard.press('Enter');
    await expect(console_.getByTestId('note-pane').getByLabel('Title')).toHaveValue(
      'Guard took the bribe',
    );
    await expect(console_.getByLabel('Find in notes')).toHaveValue('owes the party');

    // The strip's Dice button opens the shared pool at every window width. (Below 1180 px the
    // strip hides its own dice chips, and CI screens are narrower than that, so roll here.)
    await strip.getByRole('button', { name: 'Dice', exact: true }).click();
    const dice = console_.getByRole('dialog', { name: 'Dice' });
    await dice.getByRole('button', { name: 'Add d6', exact: true }).click();
    await dice.getByRole('button', { name: 'Add d6', exact: true }).click();
    await dice.getByRole('button', { name: 'Roll the pool', exact: true }).click();
    await expect(dice.getByRole('list', { name: 'Roll log' })).toContainText('2d6');
    await console_.keyboard.press('Escape');
    await expect(console_.getByRole('dialog', { name: 'Dice' })).toHaveCount(0);

    // Open the player window from the strip; the Scenes tool sends a title card through main.
    const playerPromise = app.waitForEvent('window');
    await strip.getByRole('button', { name: 'Open TV (tray)' }).click();
    const player = await playerPromise;
    await expect(player).toHaveTitle('Trifold player');
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    // A fresh campaign's dock opens with Scenes showing (ADR 0009), so its form is ready.
    await expect(dockTool('Scenes')).toHaveAttribute('aria-pressed', 'true');
    await console_.getByLabel('New scene title').fill('The Sunken Keep');
    await console_.getByRole('button', { name: 'New title card' }).click();
    await expect(console_.getByTestId('scene-row')).toHaveCount(1);
    // Click selects; Enter sends (nothing goes live by accident).
    await console_.getByTestId('scene-row').click();
    await expect(player.getByRole('heading', { name: 'The Sunken Keep' })).toHaveCount(0);
    await console_.getByTestId('scene-row').press('Enter');
    await expect(player.getByRole('heading', { name: 'The Sunken Keep' })).toBeVisible();
    await expect(console_.getByTestId('live-status')).toHaveText('Live: The Sunken Keep');
    // The break screen is shown from the TV tab (ADR 0008); the strip only mirrors one-tap actions.
    await tab('VTT').click();
    await console_.getByRole('button', { name: 'Break…' }).click();
    await console_.getByLabel('Break title').fill('Snacks');
    await console_.getByRole('button', { name: 'Show break screen' }).click();
    await expect(player.getByTestId('break-screen')).toContainText('Snacks');
    await console_.getByRole('button', { name: 'End break' }).click();
    await expect(player.getByTestId('break-screen')).toHaveCount(0);
    await strip.getByRole('button', { name: 'Blackout' }).click();
    await expect(player.getByTestId('player-blackout')).toBeVisible();

    // A blank grid goes live, the party lands where the DM clicks, and the TV mirrors it.
    // The TV tab's empty state offers the same button while hidden; use the Scenes tool's.
    await console_.getByTestId('dock').getByRole('button', { name: 'New blank grid' }).click();
    const gridRow = console_.getByTestId('scene-row').filter({ hasText: 'Blank grid' });
    await expect(gridRow).toHaveAttribute('aria-selected', 'true');
    await expect(tab('VTT')).toHaveAttribute('aria-selected', 'true');
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

    // Phone audio receiver (ADR 0007): on Windows the helper lists paired phones (none on CI)
    // through the bundled PowerShell script; elsewhere it reports itself unsupported.
    const phoneAudio = await console_.evaluate(() => window.trifold.phoneAudio.status());
    expect(phoneAudio.state).toBe('off');
    expect(phoneAudio.supported).toBe(process.platform === 'win32');
    const phones = await console_.evaluate(() => window.trifold.phoneAudio.listDevices());
    expect(Array.isArray(phones)).toBe(true);

    // Audio source (ADR 0007): choosing Phone pauses Trifold's player, hides it, and swaps the
    // strip's controls for the phone's; choosing This computer brings the player back.
    await console_.getByRole('button', { name: 'Phone', exact: true }).click();
    await expect(console_.getByTestId('music-player')).toHaveCount(0);
    await expect(console_.getByTestId('phone-audio')).toBeVisible();
    await expect(strip.locator('[data-strip="phone"]')).toBeVisible();
    await expect(strip.getByRole('button', { name: /^(Play|Pause) music$/ })).toHaveCount(0);
    await expect(strip.getByRole('button', { name: /Mute all audio/ })).toHaveCount(0);
    await console_.getByRole('button', { name: 'This computer', exact: true }).click();
    await expect(console_.getByTestId('music-player')).toBeVisible();
    await expect(
      console_.getByTestId('music-player').getByRole('button', { name: 'Play', exact: true }),
    ).toBeVisible();

    // Campaign export and import (ADR 0015): a fresh start without the party goes out through
    // the save dialog and comes back in as a copy beside the original.
    const exported = join(away, 'Smoke Campaign.trifold-campaign');
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, exported);
    await console_.getByRole('button', { name: 'Library', exact: true }).click();
    await libNav('Campaigns').click();
    await console_.getByRole('button', { name: 'Export Smoke Campaign…' }).click();
    await console_.getByRole('radio', { name: 'Fresh start' }).click();
    await console_.getByRole('checkbox', { name: /^Party/ }).click();
    await console_.getByRole('button', { name: 'Export…' }).click();
    await expect(console_.getByText(`Exported to ${exported}`)).toBeVisible();
    await pickNext(exported);
    await console_.getByRole('button', { name: 'Import campaign…' }).click();
    await console_.getByRole('button', { name: 'Import as a copy' }).click();
    await expect(console_.getByTestId('campaign-package-result')).toContainText(
      'Imported Smoke Campaign (copy)',
    );
    const copyDir = join(library, 'campaigns', 'smoke-campaign-2');
    expect(JSON.parse(await readFile(join(copyDir, 'campaign.json'), 'utf8')).name).toBe(
      'Smoke Campaign (copy)',
    );
    expect(await readdir(join(copyDir, 'pcs'))).toEqual([]);

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
    // Closing flushed the last saves and wrote the day's on-close zip (ADR 0015).
    backupsAfterClose = await readdir(join(library, 'backups')).catch(() => []);
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
    await rm(away, { recursive: true, force: true });
  }
  expect(backupsAfterClose.some((name) => name.endsWith('-quit.zip'))).toBe(true);
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
